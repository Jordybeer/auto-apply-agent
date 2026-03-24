import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import { evaluateJob } from '@/lib/openai';

export const maxDuration = 60;

export async function POST(request: Request) {
  return handleProcess(request);
}

export async function GET(request: Request) {
  return handleProcess(request);
}

async function handleProcess(_request: Request) {
  try {
    const supabase = await createClient();

    // Fetch all already-queued job_ids
    const { data: existingApps, error: existingError } = await supabase
      .from('applications')
      .select('job_id');

    if (existingError) throw existingError;

    const existingJobIds: string[] = (existingApps ?? []).map((a: any) => a.job_id).filter(Boolean);

    // Build jobs query, correctly exclude already-queued jobs
    let query = supabase
      .from('jobs')
      .select('id, title, company, description')
      .order('created_at', { ascending: false })
      .limit(100);

    if (existingJobIds.length > 0) {
      query = query.not('id', 'in', `(${existingJobIds.map((id) => `"${id}"`).join(',')})`);
    }

    const { data: newJobs, error: fetchError } = await query;

    if (fetchError) throw fetchError;
    if (!newJobs || newJobs.length === 0) {
      return NextResponse.json({ success: true, count: 0, message: 'Alle vacatures zijn al verwerkt.' });
    }

    // Evaluate each job via Groq and build inserts
    const inserts = await Promise.all(
      newJobs.map(async (job: any) => {
        try {
          const evaluation = await evaluateJob(
            job.description || '',
            job.title || '',
            job.company || ''
          );
          return {
            job_id: job.id,
            match_score: evaluation.match_score ?? 0,
            cover_letter_draft: evaluation.cover_letter_draft ?? '',
            resume_bullets_draft: evaluation.resume_bullets_draft ?? [],
            status: 'draft',
          };
        } catch {
          return {
            job_id: job.id,
            match_score: 0,
            cover_letter_draft: '',
            resume_bullets_draft: [],
            status: 'draft',
          };
        }
      })
    );

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
