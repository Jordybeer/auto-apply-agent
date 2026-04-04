import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';

export const maxDuration = 60;

export async function POST() { return handleProcess(); }
export async function GET()  { return handleProcess(); }

interface ExistingApp { job_id: string | null; }
interface Job { id: string; title: string; company: string; description: string; url: string; }

async function handleProcess() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: existingApps, error: existingError } = await supabase
      .from('applications')
      .select('job_id')
      .eq('user_id', user.id);
    if (existingError) throw existingError;

    const existingJobIds = new Set<string>(
      (existingApps as ExistingApp[] ?? []).map((a) => a.job_id).filter((id): id is string => Boolean(id))
    );

    const { data: allJobs, error: fetchError } = await supabase
      .from('jobs')
      .select('id, title, company, description, url')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200);
    if (fetchError) throw fetchError;

    const newJobs = (allJobs as Job[] ?? []).filter((j) => !existingJobIds.has(j.id));
    if (newJobs.length === 0)
      return NextResponse.json({ success: true, count: 0, message: 'Alle vacatures zijn al verwerkt.' });

    const inserts = newJobs.map((job) => ({
      user_id:              user.id,
      job_id:               job.id,
      match_score:          null,
      reasoning:            '',
      cover_letter_draft:   '',
      resume_bullets_draft: [],
      // Cover letter is generated lazily when the user opens the apply modal.
      // This keeps /api/process fast and ensures contact info is available
      // before the letter is written.
      status:               'draft',
    }));

    const { error: insertError } = await supabase
      .from('applications')
      .insert(inserts);
    if (insertError) throw insertError;

    return NextResponse.json({ success: true, count: inserts.length });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Process route error:', error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
