import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-server';

export const maxDuration = 60;

export async function POST() {
  try {
    const { data: existingApps } = await supabase.from('applications').select('job_id');
    const existingJobIds = new Set(existingApps?.map((app: any) => app.job_id) || []);

    const { data: allJobs, error: fetchError } = await supabase
      .from('jobs')
      .select('id, title, company, description')
      .order('created_at', { ascending: false })
      .limit(100);

    if (fetchError) throw fetchError;
    if (!allJobs || allJobs.length === 0) {
      return NextResponse.json({ success: false, message: 'No jobs found in database.' });
    }

    const jobsToProcess = allJobs.filter((job: any) => !existingJobIds.has(job.id));

    if (jobsToProcess.length === 0) {
      return NextResponse.json({ success: false, message: 'Alle vacatures in de database zijn al verwerkt.' });
    }

    const inserts = jobsToProcess.map((job: any) => ({
      job_id: job.id,
      match_score: 0,
      cover_letter_draft: '',
      resume_bullets_draft: [],
      status: 'draft',
    }));

    const { data: inserted, error: insertError } = await supabase
      .from('applications')
      .insert(inserts)
      .select('id');

    if (insertError) throw insertError;

    return NextResponse.json({ success: true, count: inserted?.length || 0 });
  } catch (error: any) {
    console.error('Process route error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
