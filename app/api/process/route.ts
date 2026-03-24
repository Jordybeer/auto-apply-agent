import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import { evaluateJob } from '@/lib/openai';

export const maxDuration = 60;

const CONCURRENCY = 5;

async function pMap<T, R>(items: T[], fn: (item: T) => Promise<R>, concurrency: number): Promise<R[]> {
  const results: R[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

export async function POST(request: Request) { return handleProcess(request); }
export async function GET(request: Request) { return handleProcess(request); }

async function handleProcess(_request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: settings } = await supabase
      .from('user_settings')
      .select('groq_api_key')
      .eq('user_id', user.id)
      .single();

    const groqKey = settings?.groq_api_key || '';
    if (!groqKey) return NextResponse.json(
      { success: false, error: 'Geen Groq API key ingesteld. Voeg er een toe via Instellingen.' },
      { status: 400 }
    );

    let cvText = '';
    try {
      const { data: signedData } = await supabase.storage
        .from('resumes')
        .createSignedUrl(`${user.id}/cv.pdf`, 60);
      if (signedData?.signedUrl) {
        const pdfRes = await fetch(signedData.signedUrl);
        const buf = await pdfRes.arrayBuffer();
        const raw = Buffer.from(buf).toString('latin1');
        const matches = raw.match(/\(([^\)]{2,200})\)/g) || [];
        cvText = matches.map((m) => m.slice(1, -1)).join(' ').replace(/\s+/g, ' ').trim().slice(0, 6000);
      }
    } catch { }

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
      .select('id, title, company, description')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200);

    if (fetchError) throw fetchError;

    // Filter out already-processed jobs in JS — avoids the Supabase .not('id','in',...) UUID quoting bug
    const newJobs = (allJobs ?? []).filter((j: any) => !existingJobIds.has(j.id));

    if (newJobs.length === 0)
      return NextResponse.json({ success: true, count: 0, message: 'Alle vacatures zijn al verwerkt.' });

    const inserts = await pMap(
      newJobs,
      async (job: any) => {
        try {
          const ev = await evaluateJob(job.description || '', job.title || '', job.company || '', groqKey, cvText);
          return {
            user_id: user.id,
            job_id: job.id,
            match_score: ev.match_score ?? 0,
            reasoning: ev.reasoning ?? '',
            cover_letter_draft: ev.cover_letter_draft ?? '',
            resume_bullets_draft: ev.resume_bullets_draft ?? [],
            status: 'draft',
          };
        } catch {
          return {
            user_id: user.id,
            job_id: job.id,
            match_score: 0,
            reasoning: '',
            cover_letter_draft: '',
            resume_bullets_draft: [],
            status: 'draft',
          };
        }
      },
      CONCURRENCY,
    );

    const { data: inserted, error: insertError } = await supabase
      .from('applications').insert(inserts).select('id');
    if (insertError) throw insertError;

    return NextResponse.json({ success: true, count: inserted?.length || 0 });
  } catch (error: any) {
    console.error('Process route error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Unknown error' }, { status: 500 });
  }
}
