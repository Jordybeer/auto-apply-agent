import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-server';
import { evaluateJob } from '@/lib/openai';

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
      return NextResponse.json({ success: false, message: 'No jobs to process in database.' });
    }

    const jobsToProcess = allJobs.filter((job: any) => !existingJobIds.has(job.id)).slice(0, 10);

    if (jobsToProcess.length === 0) {
      return NextResponse.json({ success: false, message: 'Alle vacatures in de database zijn al verwerkt.' });
    }

    const processed: any[] = [];

    for (const job of jobsToProcess) {
      try {
        const evaluation = await evaluateJob(job.description, job.title, job.company);

        const { data: appData, error: appError } = await supabase
          .from('applications')
          .insert({
            job_id: job.id,
            match_score: evaluation.match_score || 0,
            cover_letter_draft: evaluation.cover_letter_draft || 'Error generating cover letter.',
            resume_bullets_draft: evaluation.resume_bullets_draft || [],
            status: 'draft'
          })
          .select(`
            id,
            match_score,
            cover_letter_draft,
            resume_bullets_draft,
            status,
            jobs (
              title,
              company,
              url,
              description
            )
          `);

        if (appError) {
          console.error('Supabase insert error:', appError);
          throw appError;
        }
        if (appData) processed.push(appData[0]);
      } catch (err) {
        console.error(`Failed to process job ${job.title}:`, err);
      }
    }

    return NextResponse.json({ success: true, count: processed.length, processed });
  } catch (error: any) {
    console.error('Process route global error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Unknown error occurred' },
      { status: 500 }
    );
  }
}
