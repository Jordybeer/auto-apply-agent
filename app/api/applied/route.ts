import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { createClient } from '@/lib/supabase-request';

const getCachedApplied = unstable_cache(
  async (userId: string) => {
    const { createServiceClient } = await import('@/lib/supabase-service');
    const admin = createServiceClient();
    const { data } = await admin
      .from('applications')
      .select('id, status, applied_at, match_score, reasoning, cover_letter_draft, resume_bullets_draft, contact_person, contact_email, note, notes, jobs(title, company, url, source, description, location)')
      .eq('user_id', userId)
      .in('status', ['applied', 'in_progress', 'rejected', 'accepted'])
      .order('applied_at', { ascending: false });
    return data ?? [];
  },
  ['applied-applications'],
  { revalidate: 30 },
);
import { scoreJob, draftCoverLetter, GroqRateLimitError, GroqAuthError, type CvStructuredInput } from '@/lib/groq';
import { extractCvText } from '@/lib/parse-cv';
import { slog } from '@/lib/logger';
import { checkLlmRateLimit } from '@/lib/llm-rate-limit';

const APPLIED_STATUSES = ['applied', 'in_progress', 'rejected', 'accepted'] as const;
type AppliedStatus = typeof APPLIED_STATUSES[number];

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const data = await getCachedApplied(user.id);

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
      const { data: settings } = await supabase.from('user_settings').select('groq_api_key, keywords, city, radius, cv_structured').eq('user_id', user.id).single();
      const groqKey = settings?.groq_api_key || process.env.GROQ_API_KEY || '';
      let cvText = '';
      try {
        const { data: signedData } = await supabase.storage.from('resumes').createSignedUrl(`${user.id}/cv.pdf`, 60);
        if (signedData?.signedUrl) {
          const pdfRes = await fetch(signedData.signedUrl);
          cvText = await extractCvText(Buffer.from(await pdfRes.arrayBuffer()));
        }
      } catch {}
      if (groqKey) {
        const kwString = (settings?.keywords as string[] | null)?.join(', ') || undefined;
        const cvStruct = (settings?.cv_structured as CvStructuredInput | null) || undefined;
        const userCity = (settings?.city as string | null) || null;
        const userRadius = typeof settings?.radius === 'number' ? settings.radius : null;
        const score = await scoreJob(description || '', title, company, groqKey, cvText, kwString, undefined, cvStruct, userCity, userRadius);
        matchScore = score.match_score ?? 0;
        reasoning = score.reasoning ?? '';
        bullets = score.resume_bullets_draft || [];
        const { allowed } = await checkLlmRateLimit(user.id, supabase);
        if (allowed) {
          const letter = await draftCoverLetter(description || '', title, company, groqKey, cvText, undefined, kwString, cvStruct);
          coverLetter = letter.cover_letter_draft || '';
        }
      }
    } catch (e: unknown) {
      if (e instanceof GroqRateLimitError) return NextResponse.json({ error: e.message }, { status: 429 });
      if (e instanceof GroqAuthError) return NextResponse.json({ error: e.message }, { status: 401 });
      void slog.warn('applied', 'Groq generatie mislukt bij handmatige sollicitatie', { error: e instanceof Error ? e.message : String(e) }, user.id);
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
