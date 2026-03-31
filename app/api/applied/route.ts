import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import { evaluateJob } from '@/lib/openai';
import { extractCvText } from '@/lib/parse-cv';

const APPLIED_STATUSES = ['applied', 'in_progress', 'rejected', 'accepted'] as const;
type AppliedStatus = typeof APPLIED_STATUSES[number];

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('applications')
    .select(`id, status, applied_at, match_score, reasoning, cover_letter_draft, resume_bullets_draft, contact_person, contact_email, jobs ( title, company, url, source )`)
    .eq('user_id', user.id)
    .in('status', APPLIED_STATUSES)
    .order('applied_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const normalized = (data || []).map((app: any) => ({
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
      const { data: settings } = await supabase.from('user_settings').select('groq_api_key').eq('user_id', user.id).single();
      const groqKey = settings?.groq_api_key || '';
      let cvText = '';
      try {
        const { data: signedData } = await supabase.storage.from('resumes').createSignedUrl(`${user.id}/cv.pdf`, 60);
        if (signedData?.signedUrl) {
          const pdfRes = await fetch(signedData.signedUrl);
          cvText = await extractCvText(Buffer.from(await pdfRes.arrayBuffer()));
        }
      } catch {}
      if (groqKey) {
        const ev = await evaluateJob(description || '', title, company, groqKey, cvText);
        coverLetter = ev.cover_letter_draft || '';
        bullets = ev.resume_bullets_draft || [];
        matchScore = ev.match_score ?? 0;
        reasoning = ev.reasoning ?? '';
      }
    } catch (e: any) {
      console.warn('Groq generation failed in manual apply:', e?.message);
    }
  }

  const { data: appRow, error: appErr } = await supabase
    .from('applications')
    .insert({
      user_id: user.id, job_id: jobRow.id, status: 'applied',
      applied_at: new Date().toISOString(),
      status_changed_at: new Date().toISOString(),
      cover_letter_draft: coverLetter, resume_bullets_draft: bullets,
      match_score: matchScore, reasoning,
    })
    .select('id')
    .single();

  if (appErr || !appRow) return NextResponse.json({ error: appErr?.message || 'Application insert failed' }, { status: 500 });

  return NextResponse.json({ ok: true, application_id: appRow.id, job_id: jobRow.id, cover_letter_draft: coverLetter, resume_bullets_draft: bullets, match_score: matchScore, reasoning });
}

// PATCH: update status — expects { application_id, status }
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { application_id, status } = await request.json();
  if (!application_id) return NextResponse.json({ error: 'application_id required' }, { status: 400 });
  if (!APPLIED_STATUSES.includes(status as AppliedStatus))
    return NextResponse.json({ error: `status must be one of: ${APPLIED_STATUSES.join(', ')}` }, { status: 400 });

  const { error } = await supabase
    .from('applications')
    .update({ status, status_changed_at: new Date().toISOString() })
    .eq('id', application_id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE: expects { application_id }
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
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
