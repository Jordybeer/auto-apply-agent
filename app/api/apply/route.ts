import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import { evaluateJob } from '@/lib/openai';
import { extractCvText } from '@/lib/parse-cv';
import { scrapeContactInfo } from '@/lib/scrape-contact';
import { scrapeJobDescriptionWithHtml } from '@/lib/scrape-job-description';

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { application_id } = await request.json();
    if (!application_id) return NextResponse.json({ error: 'application_id required' }, { status: 400 });

    const { data: app, error: appErr } = await supabase
      .from('applications')
      .select('id, job_id, status, cover_letter_draft, resume_bullets_draft, match_score, reasoning, jobs ( title, company, description, url )')
      .eq('id', application_id)
      .eq('user_id', user.id)
      .single();

    if (appErr || !app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    if (app.status !== 'saved') return NextResponse.json({ error: 'Application is not in saved status' }, { status: 400 });

    const { data: settings } = await supabase
      .from('user_settings')
      .select('groq_api_key, auto_apply_threshold')
      .eq('user_id', user.id)
      .single();

    const groqKey            = settings?.groq_api_key || '';
    const autoApplyThreshold = (settings as any)?.auto_apply_threshold ?? 0;
    const job: any           = Array.isArray(app.jobs) ? app.jobs[0] : app.jobs;

    let cvText = '';
    try {
      const { data: signedData } = await supabase.storage
        .from('resumes')
        .createSignedUrl(`${user.id}/cv.pdf`, 60);
      if (signedData?.signedUrl) {
        const pdfRes = await fetch(signedData.signedUrl);
        const buf    = Buffer.from(await pdfRes.arrayBuffer());
        cvText       = await extractCvText(buf);
      }
    } catch (cvErr) {
      console.warn('CV extraction failed, proceeding without CV context:', cvErr);
    }

    let contactName  = '';
    let contactEmail = '';
    let enrichedDescription = job?.description || '';

    if (job?.url) {
      const { description: freshDesc, html } = await scrapeJobDescriptionWithHtml(job.url);
      if (freshDesc.length > enrichedDescription.length + 100) {
        enrichedDescription = freshDesc;
        await supabase.from('jobs').update({ description: freshDesc }).eq('id', app.job_id);
      }
      if (html) {
        const contact = await scrapeContactInfo(job.url, html);
        contactName  = contact.name;
        contactEmail = contact.email;
      }
    }

    let ev: Record<string, any> = {
      match_score:          0,
      reasoning:            '',
      cover_letter_draft:   '',
      resume_bullets_draft: [],
    };

    let groqSkipped = false;
    let groqError: string | undefined;

    if (groqKey) {
      try {
        ev = await evaluateJob(
          enrichedDescription,
          job?.title   || '',
          job?.company || '',
          groqKey,
          cvText,
          contactName || undefined,
        );
      } catch (err: any) {
        console.warn('Groq evaluation failed:', err?.message ?? err);
        groqSkipped = true;
        groqError   = err?.message ?? 'Unknown Groq error';
      }
    } else {
      groqSkipped = true;
    }

    const autoApply =
      autoApplyThreshold > 0 &&
      !groqSkipped &&
      (ev.match_score ?? 0) >= autoApplyThreshold;

    const updatePayload: Record<string, any> = {
      match_score:          ev.match_score          ?? 0,
      reasoning:            ev.reasoning            ?? '',
      cover_letter_draft:   ev.cover_letter_draft   ?? '',
      resume_bullets_draft: ev.resume_bullets_draft ?? [],
      contact_person:       contactName  || null,
      contact_email:        contactEmail || null,
    };

    if (autoApply) {
      updatePayload.status     = 'applied';
      updatePayload.applied_at = new Date().toISOString();
    }

    const { data: updated, error: updateErr } = await supabase
      .from('applications')
      .update(updatePayload)
      .eq('id', application_id)
      .eq('user_id', user.id)
      .eq('status', 'saved')
      .select('id');

    if (updateErr) throw updateErr;
    if (!updated || updated.length === 0)
      return NextResponse.json({ error: 'Application already processed' }, { status: 409 });

    return NextResponse.json({
      ok:                   true,
      match_score:          ev.match_score          ?? 0,
      reasoning:            ev.reasoning            ?? '',
      cover_letter_draft:   ev.cover_letter_draft   ?? '',
      resume_bullets_draft: ev.resume_bullets_draft ?? [],
      groq_skipped:         groqSkipped,
      groq_error:           groqError,
      contact_person:       contactName  || null,
      contact_email:        contactEmail || null,
      auto_applied:         autoApply,
    });
  } catch (err: any) {
    console.error('apply route error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { application_id, cover_letter_draft, resume_bullets_draft, confirm } = await request.json();
    if (!application_id) return NextResponse.json({ error: 'application_id required' }, { status: 400 });

    // Only include fields that were actually provided — prevent clobbering existing data with undefined
    const update: Record<string, any> = {};
    if (cover_letter_draft  !== undefined) update.cover_letter_draft  = cover_letter_draft;
    if (resume_bullets_draft !== undefined) update.resume_bullets_draft = resume_bullets_draft;

    if (confirm) {
      update.status     = 'applied';
      update.applied_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('applications')
      .update(update)
      .eq('id', application_id)
      .eq('user_id', user.id)
      .in('status', confirm ? ['saved'] : ['saved', 'applied']);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}

// DELETE: remove a saved application (revert to draft so it reappears in queue)
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { application_id } = await request.json();
    if (!application_id) return NextResponse.json({ error: 'application_id required' }, { status: 400 });

    const { error } = await supabase
      .from('applications')
      .update({ status: 'skipped' })
      .eq('id', application_id)
      .eq('user_id', user.id)
      .eq('status', 'saved');

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
