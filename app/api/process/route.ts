import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { evaluateJob } from '@/lib/openai';

export async function POST() {
  try {
    // 1. Fetch recent jobs
    const { data: jobs, error: fetchError } = await supabase
      .from('jobs')
      .select('id, title, company, description')
      .order('created_at', { ascending: false })
      .limit(5);

    if (fetchError) throw fetchError;
    if (!jobs || jobs.length === 0) return NextResponse.json({ message: "No jobs to process" });

    // Fetch existing app IDs to avoid processing duplicates
    const { data: existingApps } = await supabase.from('applications').select('job_id');
    const existingJobIds = new Set(existingApps?.map(app => app.job_id));
    
    const jobsToProcess = jobs.filter(job => !existingJobIds.has(job.id));
    
    if (jobsToProcess.length === 0) {
      return NextResponse.json({ message: "All jobs already processed." });
    }

    const processed = [];

    // 2. Process each new job via OpenAI
    for (const job of jobsToProcess) {
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

      if (appError) throw appError;
      if (appData) processed.push(appData[0]);
    }

    return NextResponse.json({ success: true, count: processed.length, processed });
  } catch (error: any) {
    console.error("Process error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}