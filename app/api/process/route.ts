import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';

export const maxDuration = 60;
const supabase = await createClient();

function computeMatchScore(title: string, description: string, keywords: string[]): number {
  if (keywords.length === 0) return 0;
  const text = `${title} ${description}`.toLowerCase();
  const matched = keywords.filter((kw) => text.includes(kw.toLowerCase()));
  return Math.round((matched.length / keywords.length) * 100);
}

export async function POST(request: Request) {
  try {
    // Accept optional keywords from body to compute match_score
    let keywords: string[] = [];
    try {
      const body = await request.json();
      if (Array.isArray(body?.keywords)) keywords = body.keywords;
    } catch {}

    // Fetch already-processed job_ids in one query
    const { data: existingApps, error: existingError } = await supabase
      .from('applications')
      .select('job_id');

    if (existingError) throw existingError;

    const existingJobIds = (existingApps ?? []).map((a: any) => a.job_id);

    // Fetch only jobs not yet in applications
    let query = supabase
      .from('jobs')
      .select('id, title, company, description')
      .order('created_at', { ascending: false })
      .limit(100);

    if (existingJobIds.length > 0) {
      query = query.not('id', 'in', `(${existingJobIds.join(',')})`);
    }

    const { data: newJobs, error: fetchError } = await query;

    if (fetchError) throw fetchError;
    if (!newJobs || newJobs.length === 0) {
      return NextResponse.json({ success: false, message: 'Alle vacatures in de database zijn al verwerkt.' });
    }

    const inserts = newJobs.map((job: any) => ({
      job_id: job.id,
      match_score: computeMatchScore(job.title || '', job.description || '', keywords),
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
