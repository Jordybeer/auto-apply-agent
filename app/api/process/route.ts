import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';

export const maxDuration = 60;

export async function POST(request: Request) { return handleProcess(request); }
export async function GET(request: Request)  { return handleProcess(request); }

async function handleProcess(_request: Request) {
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
      (existingApps ?? []).map((a: any) => a.job_id).filter(Boolean)
    );

    const { data: allJobs, error: fetchError } = await supabase
      .from('jobs')
      .select('id, title, company')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200);
    if (fetchError) throw fetchError;

    const newJobs = (allJobs ?? []).filter((j: any) => !existingJobIds.has(j.id));
    if (newJobs.length === 0)
      return NextResponse.json({ success: true, count: 0, message: 'Alle vacatures zijn al verwerkt.' });

    const inserts = newJobs.map((job: any) => ({
      user_id:              user.id,
      job_id:               job.id,
      match_score:          50,
      reasoning:            '',
      cover_letter_draft:   '',
      resume_bullets_draft: [],
      status:               'draft',
    }));

    const { error: insertError } = await supabase.from('applications').insert(inserts);
    if (insertError) throw insertError;

    return NextResponse.json({ success: true, count: inserts.length, failed: 0 });
  } catch (error: any) {
    console.error('Process route error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Unknown error' }, { status: 500 });
  }
}
