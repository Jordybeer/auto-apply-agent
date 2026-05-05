import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import type { EvalResult } from '@/lib/groq';
import { extractCvText } from '@/lib/parse-cv';
import { scrapeContactInfo } from '@/lib/scrape-contact';
import { scrapeJobDescriptionWithHtml } from '@/lib/scrape-job-description';
import { slog } from '@/lib/logger';
import { notifyTelegram, approvalMarkup, escTg } from '@/lib/telegram';
import { isPremium } from '@/lib/require-premium';
import { scoreJobPremium, draftCoverLetterPremium } from '@/lib/anthropic';
import { createServiceClient } from '@/lib/supabase-service';

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

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { application_id, generate_letter = false } = body as {
      application_id?: string;
      generate_letter?: boolean;
    };
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
      .select('auto_apply_threshold, cv_text, cv_structured, keywords, city, radius, free_letters_count')
      .eq('user_id', user.id)
      .single();

    const userPremium = await isPremium(user.id);
    const service = createServiceClient();

    const autoApplyThreshold = Number(settings?.auto_apply_threshold ?? 0);
    const job = (Array.isArray(app.jobs) ? app.jobs[0] : app.jobs) as JobRow | null;

    if (!job) {
      return NextResponse.json({ error: 'Vacature niet gevonden.' }, { status: 404 });
    }

    await slog.info('apply', 'Analyse gestart', { application_id, job: job.title, company: job.company, generate_letter }, user.id);

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
    let evalError: string | undefined;
    let briefPaywalled = false;

    // --- Scoring (Haiku, unlimited for all users) ---
    try {
      const kwArray = (settings?.keywords as string[] | null) ?? [];
      const { score, reasoning } = await scoreJobPremium({
        jobDescription: enrichedDescription,
        cvText,
        keywords: kwArray,
        location: job.location || '',
      });
      ev = { match_score: score, reasoning, cover_letter_draft: '', resume_bullets_draft: [] };
      await slog.info('apply', 'Score voltooid', { application_id, score }, user.id);
    } catch (err: unknown) {
      evalError = err instanceof Error ? `Scoring mislukt: ${err.message}` : 'Scoring mislukt — probeer het opnieuw.';
      await slog.warn('apply', 'Scoring mislukt', { application_id, error: evalError }, user.id);
    }

    // --- Cover letter (Sonnet, only when explicitly requested) ---
    if (generate_letter) {
      const freeLettersUsed = Number(settings?.free_letters_count ?? 0);
      const canGenerateLetter = userPremium || freeLettersUsed < 3;

      if (!canGenerateLetter) {
        briefPaywalled = true;
        await slog.info('apply', 'Brief geweigerd — daglimiet bereikt', { application_id, freeLettersUsed }, user.id);
      } else {
        try {
          const letter = await draftCoverLetterPremium({
            jobDescription: enrichedDescription,
            cvText,
            jobTitle: job.title || '',
            company: job.company || '',
          });
          ev.cover_letter_draft = letter;
          if (!userPremium) {
            await service.from('user_settings')
              .update({ free_letters_count: freeLettersUsed + 1 })
              .eq('user_id', user.id);
          }
          await slog.info('apply', 'Brief gegenereerd', { application_id, premium: userPremium }, user.id);
        } catch (letterErr: unknown) {
          evalError = letterErr instanceof Error ? `Brief mislukt: ${letterErr.message}` : 'Brief genereren mislukt.';
          await slog.warn('apply', 'Brief generatie mislukt', { application_id, error: evalError }, user.id);
        }
      }
    }

    const score = ev.match_score ?? 0;
    const wouldAutoApply =
      autoApplyThreshold > 0 &&
      !evalError &&
      score >= autoApplyThreshold &&
      app.status === 'saved';

    const needsApproval = wouldAutoApply && score >= 85;
    const autoApply     = wouldAutoApply && score < 85;

    const updatePayload: Record<string, unknown> = {
      match_score:          ev.match_score          ?? 0,
      reasoning:            ev.reasoning            ?? '',
      resume_bullets_draft: ev.resume_bullets_draft ?? [],
      contact_person:       contactName  || null,
      contact_email:        contactEmail || null,
    };

    // Only overwrite saved letter when a new one was generated
    if (generate_letter && ev.cover_letter_draft) {
      updatePayload.cover_letter_draft = ev.cover_letter_draft;
    }

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
      groq_skipped:         false,
      groq_error:           briefPaywalled ? 'brief_paywalled' : (evalError ?? null),
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
