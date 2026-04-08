import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import { slog } from '@/lib/logger';

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
    if (newJobs.length === 0) {
      await slog.info('process', 'Alle vacatures al verwerkt', {}, user.id);
      return NextResponse.json({ success: true, count: 0, message: 'Alle vacatures zijn al verwerkt.' });
    }

    await slog.info('process', 'Verwerking gestart', { new_jobs: newJobs.length }, user.id);

    const inserts = newJobs.map((job) => ({
      user_id:              user.id,
      job_id:               job.id,
      match_score:          null,
      reasoning:            '',
      cover_letter_draft:   '',
      resume_bullets_draft: [],
      status:               'draft',
    }));

    const { error: insertError } = await supabase
      .from('applications')
      .insert(inserts);
    if (insertError) throw insertError;

    await slog.info('process', 'Verwerking voltooid', { inserted: inserts.length }, user.id);
    return NextResponse.json({ success: true, count: inserts.length });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    await slog.error('process', 'Process route fout', { error: msg });
    console.error('Process route error:', error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
