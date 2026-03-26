import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import { evaluateJob } from '@/lib/openai';
import { extractCvText } from '@/lib/parse-cv';
import { scrapeContactPerson } from '@/lib/scrape-contact';

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
      .select('groq_api_key')
      .eq('user_id', user.id)
      .single();

    const groqKey = settings?.groq_api_key || '';
    const job: any = Array.isArray(app.jobs) ? app.jobs[0] : app.jobs;

    let cvText = '';
    try {
      const { data: signedData } = await supabase.storage
        .from('resumes')
        .createSignedUrl(`${user.id}/cv.pdf`, 60);
      if (signedData?.signedUrl) {
        const pdfRes = await fetch(signedData.signedUrl);
        const buf = Buffer.from(await pdfRes.arrayBuffer());
        cvText = await extractCvText(buf);
      }
    } catch (cvErr) {
      console.warn('CV extraction failed, proceeding without CV context:', cvErr);
    }

    let contactPerson = '';
    if (job?.url) {
      contactPerson = await scrapeContactPerson(job.url);
      if (contactPerson) console.log(`Contact person found: ${contactPerson}`);
    }

    let ev: Record<string, any> = {
      match_score: 0,
      reasoning: '',
      cover_letter_draft: '',
      resume_bullets_draft: [],
    };

    let groqSkipped = false;
    let groqError: string | undefined;

    if (groqKey) {
      try {
        ev = await evaluateJob(
          job?.description || '',
          job?.title || '',
          job?.company || '',
          groqKey,
          cvText,
          contactPerson || undefined,
        );
      } catch (err: any) {
        console.warn('Groq evaluation failed:', err?.message ?? err);
        groqSkipped = true;
        groqError = err?.message ?? 'Unknown Groq error';
      }
    } else {
      groqSkipped = true;
    }

    const { error: updateErr } = await supabase
      .from('applications')
      .update({
        match_score: ev.match_score ?? 0,
        reasoning: ev.reasoning ?? '',
        cover_letter_draft: ev.cover_letter_draft ?? '',
        resume_bullets_draft: ev.resume_bullets_draft ?? [],
      })
      .eq('id', application_id)
      .eq('user_id', user.id);

    if (updateErr) throw updateErr;

    return NextResponse.json({
      ok: true,
      match_score: ev.match_score ?? 0,
      reasoning: ev.reasoning ?? '',
      cover_letter_draft: ev.cover_letter_draft ?? '',
      resume_bullets_draft: ev.resume_bullets_draft ?? [],
      groq_skipped: groqSkipped,
      groq_error: groqError,
      contact_person: contactPerson || null,
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

    // Only stamp status + applied_at on first confirm (saved → applied), not on edits
    const update: Record<string, any> = { cover_letter_draft, resume_bullets_draft };
    if (confirm) {
      update.status = 'applied';
      update.applied_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('applications')
      .update(update)
      .eq('id', application_id)
      .eq('user_id', user.id);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
