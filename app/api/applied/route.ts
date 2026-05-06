import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import { scoreJobPremium, draftCoverLetterPremium } from '@/lib/anthropic';
import { extractCvText } from '@/lib/parse-cv';
import { slog } from '@/lib/logger';
import { checkLlmRateLimit } from '@/lib/llm-rate-limit';

const APPLIED_STATUSES = ['applied', 'in_progress', 'rejected', 'accepted'] as const;
type AppliedStatus = typeof APPLIED_STATUSES[number];

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: rows } = await supabase
    .from('applications')
    .select('id, status, applied_at, match_score, reasoning, cover_letter_draft, resume_bullets_draft, contact_person, contact_email, note, notes, jobs(title, company, url, source, description, location)')
    .eq('user_id', user.id)
    .in('status', ['applied', 'in_progress', 'rejected', 'accepted'])
    .order('applied_at', { ascending: false });

  const data = rows ?? [];
  const normalized = data.map((app: Record<string, unknown>) => ({
    ...app,
    jobs: Array.isArray(app.jobs) ? app.jobs[0] : app.jobs,
  }));

  return NextResponse.json({ applications: normalized });
}

// POST: create a manual application
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { title, company, url, description, cover_letter_draft, resume_bullets_draft, generate_groq } = body;

  if (!title || !company) return NextResponse.json({ error: 'title and company are required' }, { status: 400 });

  const { data: jobRow, error: jobErr } = await supabase
    .from('jobs')
    .insert({ user_id: user.id, title, company, url: url || null, description: description || '', source: 'manual', source_id: null })
    .select('id')
    .single();

  if (jobErr || !jobRow) return NextResponse.json({ error: jobErr?.message || 'Job insert failed' }, { status: 500 });

  let coverLetter = cover_letter_draft || '';
  let bullets: string[] = resume_bullets_draft || [];
  let matchScore = 0;
  let reasoning = '';

  if (generate_groq) {
    try {
      const { data: settings } = await supabase.from('user_settings').select('keywords, cv_text').eq('user_id', user.id).single();
      let cvText = (settings?.cv_text as string | null) ?? '';
      if (!cvText) {
        try {
          const { data: signedData } = await supabase.storage.from('resumes').createSignedUrl(`${user.id}/cv.pdf`, 60);
          if (signedData?.signedUrl) {
            const pdfRes = await fetch(signedData.signedUrl);
            cvText = await extractCvText(Buffer.from(await pdfRes.arrayBuffer()));
          }
        } catch {}
      }
      const scoreResult = await scoreJobPremium({
        jobDescription: description || '',
        cvText,
        keywords: (settings?.keywords as string[] | null) ?? [],
        location: '',
        userId: user.id,
      });
      matchScore = scoreResult.score ?? 0;
      reasoning = scoreResult.reasoning ?? '';
      const { allowed } = await checkLlmRateLimit(user.id, supabase);
      if (allowed) {
        coverLetter = await draftCoverLetterPremium({
          jobDescription: description || '',
          cvText,
          jobTitle: title,
          company,
          userId: user.id,
        });
      }
    } catch (e: unknown) {
      void slog.warn('applied', 'Generatie mislukt bij handmatige sollicitatie', { error: e instanceof Error ? e.message : String(e) }, user.id);
    }
  }

  const { data: appRow, error: appErr } = await supabase
    .from('applications')
    .insert({
      user_id: user.id, job_id: jobRow.id, status: 'saved',
      status_changed_at: new Date().toISOString(),
      cover_letter_draft: coverLetter, resume_bullets_draft: bullets,
      match_score: matchScore, reasoning,
    })
    .select('id')
    .single();

  if (appErr || !appRow) return NextResponse.json({ error: appErr?.message || 'Application insert failed' }, { status: 500 });

  return NextResponse.json({ ok: true, application_id: appRow.id, job_id: jobRow.id, cover_letter_draft: coverLetter, resume_bullets_draft: bullets, match_score: matchScore, reasoning });
}

/**
 * PATCH /api/applied
 *
 * Accepted fields (at least one required besides application_id):
 *   status             – one of the APPLIED_STATUSES values
 *   cover_letter_draft – string (replaces the stored motivatiebrief)
 *   contact_person     – string | null
 *   contact_email      – string | null
 *   note               – string | null (free-text note per application)
 */
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { application_id, status, cover_letter_draft, contact_person, contact_email, note, notes } = body;

  if (!application_id) return NextResponse.json({ error: 'application_id required' }, { status: 400 });

  const updates: Record<string, unknown> = {};

  if (status !== undefined) {
    if (!APPLIED_STATUSES.includes(status as AppliedStatus)) {
      return NextResponse.json(
        { error: `status must be one of: ${APPLIED_STATUSES.join(', ')}` },
        { status: 400 },
      );
    }
    updates.status = status;
    updates.status_changed_at = new Date().toISOString();
  }

  if (cover_letter_draft !== undefined) {
    updates.cover_letter_draft = typeof cover_letter_draft === 'string' ? cover_letter_draft : null;
  }

  if (contact_person !== undefined) updates.contact_person = contact_person ?? null;
  if (contact_email  !== undefined) updates.contact_email  = contact_email  ?? null;
  if (note           !== undefined) updates.note           = typeof note === 'string' ? note : null;
  if (notes !== undefined) {
    if (!Array.isArray(notes) || notes.length > 50 ||
        notes.some((n: unknown) => typeof n !== 'object' || n === null))
      return NextResponse.json({ error: 'Ongeldige notities.' }, { status: 400 });
    updates.notes = notes;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 });
  }

  const { error } = await supabase
    .from('applications')
    .update(updates)
    .eq('id', application_id)
    .eq('user_id', user.id)
    .in('status', APPLIED_STATUSES);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE: soft-remove an applied application (set to skipped)
export async function DELETE(request: Request) {
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
    .in('status', APPLIED_STATUSES);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
