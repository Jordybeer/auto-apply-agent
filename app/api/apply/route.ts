import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import { scoreJob, draftCoverLetter, GroqRateLimitError, GroqAuthError } from '@/lib/groq';
import type { EvalResult, CvStructuredInput } from '@/lib/groq';
import { extractCvText } from '@/lib/parse-cv';
import { scrapeContactInfo } from '@/lib/scrape-contact';
import { scrapeJobDescriptionWithHtml } from '@/lib/scrape-job-description';
import { slog } from '@/lib/logger';
import { checkLlmRateLimit } from '@/lib/llm-rate-limit';
import { notifyTelegram, approvalMarkup, escTg } from '@/lib/telegram';

export const maxDuration = 60;

const ALL_ACTIVE_STATUSES = ['saved', 'applied', 'in_progress', 'accepted', 'rejected'] as const;

interface JobRow {
  title: string;
  company: string;
  description: string | null;
  url: string | null;
  location: string | null;
}

const EMPTY_EVAL: EvalResult = {
  match_score:          0,
  reasoning:            '',
  cover_letter_draft:   '',
  resume_bullets_draft: [],
};

function friendlyGroqError(err: unknown): string {
  if (err instanceof GroqAuthError)      return err.message;
  if (err instanceof GroqRateLimitError) return err.message;
  if (err instanceof Error)              return `Generatie mislukt: ${err.message}`;
  return 'Generatie mislukt — probeer het opnieuw.';
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { application_id } = await request.json();
    if (!application_id) return NextResponse.json({ error: 'application_id required' }, { status: 400 });

    const { data: app, error: appErr } = await supabase
      .from('applications')
      .select('id, job_id, status, cover_letter_draft, resume_bullets_draft, match_score, reasoning, jobs ( title, company, description, url, location )')
      .eq('id', application_id)
      .eq('user_id', user.id)
      .single();

    if (appErr || !app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

    const activeStatuses: string[] = [...ALL_ACTIVE_STATUSES];
    if (!activeStatuses.includes(app.status)) {
      return NextResponse.json({ error: 'Application is not in an active status' }, { status: 400 });
    }

    const { data: settings } = await supabase
      .from('user_settings')
      .select('groq_api_key, auto_apply_threshold, cv_text, cv_structured, keywords, city, radius')
      .eq('user_id', user.id)
      .single();

    const groqKey            = (settings?.groq_api_key as string | null | undefined)?.trim() || process.env.GROQ_API_KEY || '';
    const autoApplyThreshold = Number(settings?.auto_apply_threshold ?? 0);
    const job                = (Array.isArray(app.jobs) ? app.jobs[0] : app.jobs) as JobRow | null;

    if (!job) {
      return NextResponse.json({ error: 'Vacature niet gevonden.' }, { status: 404 });
    }

    await slog.info('apply', 'Generatie gestart', { application_id, job: job.title, company: job.company }, user.id);

    let cvText = (settings?.cv_text as string | null) ?? '';

    if (!cvText) {
      try {
        const { data: signedData } = await supabase.storage
          .from('resumes')
          .createSignedUrl(`${user.id}/cv.pdf`, 60);
        if (signedData?.signedUrl) {
          const pdfRes = await fetch(signedData.signedUrl);
          const buf    = Buffer.from(await pdfRes.arrayBuffer());
          cvText       = await extractCvText(buf);
          await supabase
            .from('user_settings')
            .upsert({ user_id: user.id, cv_text: cvText }, { onConflict: 'user_id' });
        }
      } catch (cvErr) {
        await slog.warn('apply', 'CV extractie mislukt', { error: String(cvErr) }, user.id);
      }
    }

    let contactName  = '';
    let contactEmail = '';
    let enrichedDescription = job.description || '';

    if (job.url) {
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

    let ev: EvalResult = { ...EMPTY_EVAL };
    let groqSkipped = false;
    let groqError: string | undefined;

    if (groqKey) {
      try {
        const kwString = (settings?.keywords as string[] | null)?.join(', ') || undefined;
        const cvStruct = (settings?.cv_structured as CvStructuredInput | null) || undefined;
        const userCity = (settings?.city as string | null) || null;
        const userRadius = typeof settings?.radius === 'number' ? settings.radius : null;
        const score = await scoreJob(enrichedDescription, job.title || '', job.company || '', groqKey, cvText, kwString, job.location || undefined, cvStruct, userCity, userRadius);
        ev = { ...score, cover_letter_draft: '' };
        await slog.info('apply', 'Score voltooid', { application_id, score: score.match_score }, user.id);
        const { allowed } = await checkLlmRateLimit(user.id, supabase);
        if (!allowed) {
          groqError = 'Daglimiet bereikt — score berekend, brief overgeslagen.';
        } else {
          const letter = await draftCoverLetter(enrichedDescription, job.title || '', job.company || '', groqKey, cvText, contactName || undefined, kwString, cvStruct);
          ev.cover_letter_draft = letter.cover_letter_draft;
          await slog.info('apply', 'Brief gegenereerd', { application_id }, user.id);
        }
      } catch (err: unknown) {
        groqSkipped = !ev.match_score;
        groqError   = friendlyGroqError(err);
        await slog.warn('apply', 'Groq evaluatie mislukt', { application_id, error: groqError }, user.id);
      }
    } else {
      groqSkipped = true;
      groqError   = 'Geen Groq API-sleutel ingesteld. Voer je sleutel in via Instellingen of stel GROQ_API_KEY in als omgevingsvariabele.';
      await slog.warn('apply', 'Geen Groq API-sleutel', { application_id }, user.id);
    }

    const score = ev.match_score ?? 0;
    const wouldAutoApply =
      autoApplyThreshold > 0 &&
      !groqSkipped &&
      score >= autoApplyThreshold &&
      app.status === 'saved';

    // For 85%+: always send Telegram alert with Apply/Skip buttons.
    // High-score jobs block auto-apply until the user replies via Telegram.
    const needsApproval = wouldAutoApply && score >= 85;
    const autoApply     = wouldAutoApply && score < 85;

    const updatePayload: Record<string, unknown> = {
      match_score:          ev.match_score          ?? 0,
      reasoning:            ev.reasoning            ?? '',
      cover_letter_draft:   ev.cover_letter_draft   ?? '',
      resume_bullets_draft: ev.resume_bullets_draft ?? [],
      contact_person:       contactName  || null,
      contact_email:        contactEmail || null,
    };

    if (score >= 85) {
      const emoji = score >= 95 ? '🔴' : score >= 90 ? '🟠' : '🟡';
      const label = score >= 95 ? 'Topkandidaat — goedkeuring vereist'
                  : score >= 90 ? 'Hoge match gevonden'
                  : 'Bevestig sollicitatie';
      const tgText =
        `${emoji} *${label}*\n\n` +
        `*${escTg(job.title || '')}* — ${escTg(job.company || '')}\n` +
        `Score: *${score}%*` +
        (score >= 95 ? '\n\n_Timeout na 1 uur — dan automatisch overgeslagen._' : '');
      if (app.job_id) void notifyTelegram(tgText, approvalMarkup(app.job_id));
      if (needsApproval) {
        updatePayload.approval_requested_at = new Date().toISOString();
      }
    }

    if (autoApply) {
      updatePayload.status     = 'applied';
      updatePayload.applied_at = new Date().toISOString();
      await slog.info('apply', 'Auto-apply getriggerd', { application_id, score }, user.id);
    } else if (needsApproval) {
      await slog.info('apply', 'Auto-apply uitgesteld — Telegram goedkeuring gevraagd', { application_id, score }, user.id);
    }

    await supabase
      .from('applications')
      .update(updatePayload)
      .eq('id', application_id)
      .eq('user_id', user.id);

    return NextResponse.json({
      ok:                   true,
      match_score:          ev.match_score          ?? 0,
      reasoning:            ev.reasoning            ?? '',
      cover_letter_draft:   ev.cover_letter_draft   ?? '',
      resume_bullets_draft: ev.resume_bullets_draft ?? [],
      groq_skipped:         groqSkipped,
      groq_error:           groqError ?? null,
      contact_person:       contactName  || null,
      contact_email:        contactEmail || null,
      auto_applied:         autoApply,
      needs_approval:       needsApproval,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    await slog.error('apply', 'Apply route fout', { error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { application_id, cover_letter_draft, resume_bullets_draft, confirm } = await request.json();
    if (!application_id) return NextResponse.json({ error: 'application_id required' }, { status: 400 });

    const update: Record<string, unknown> = {};
    if (cover_letter_draft   !== undefined) update.cover_letter_draft   = cover_letter_draft;
    if (resume_bullets_draft !== undefined) update.resume_bullets_draft = resume_bullets_draft;

    if (confirm) {
      update.status     = 'applied';
      update.applied_at = new Date().toISOString();
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const allowedStatuses: string[] = [...ALL_ACTIVE_STATUSES];

    const { error } = await supabase
      .from('applications')
      .update(update)
      .eq('id', application_id)
      .eq('user_id', user.id)
      .in('status', allowedStatuses);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

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
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
