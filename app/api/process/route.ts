import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import { evaluateJob } from '@/lib/openai';

// Bumped to 120s — 8 jobs * ~5s per Groq call with backoff needs headroom
export const maxDuration = 120;

// 2 concurrent workers — stays within Groq free-tier ~30 RPM
const CONCURRENCY = 2;

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
export async function GET(request: Request)  { return handleProcess(request); }

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
      { status: 400 },
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
      .select('job_id, status')
      .eq('user_id', user.id)
      .neq('status', 'failed');
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

    const newJobs = (allJobs ?? []).filter((j: any) => !existingJobIds.has(j.id));
    if (newJobs.length === 0)
      return NextResponse.json({ success: true, count: 0, message: 'Alle vacatures zijn al verwerkt.' });

    console.log(`[process] ${newJobs.length} jobs to evaluate`);

    type InsertRow = {
      user_id: string;
      job_id: string;
      match_score: number;
      reasoning: string;
      cover_letter_draft: string;
      resume_bullets_draft: string[];
      status: 'draft' | 'failed';
      fail_reason?: string;
    };

    const inserts = await pMap(
      newJobs,
      async (job: any): Promise<InsertRow> => {
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
        } catch (err: any) {
          const reason = err?.message ?? String(err);
          console.error(`[process] FAILED job "${job.title}" (${job.id}): ${reason}`);
          return {
            user_id: user.id,
            job_id: job.id,
            match_score: 0,
            reasoning: '',
            cover_letter_draft: '',
            resume_bullets_draft: [],
            status: 'failed',
            fail_reason: reason,
          };
        }
      },
      CONCURRENCY,
    );

    const successRows = inserts.filter((r) => r.status === 'draft');
    const failedRows  = inserts.filter((r) => r.status === 'failed');

    if (failedRows.length > 0) {
      console.error(`[process] ${failedRows.length} failed:`, failedRows.map((r) => r.fail_reason));
    }

    // Strip fail_reason before inserting (not a DB column)
    const toInsert = inserts.map(({ fail_reason: _fr, ...row }) => row);

    const { error: insertError } = await supabase.from('applications').insert(toInsert).select('id');
    if (insertError) throw insertError;

    return NextResponse.json({
      success: true,
      count:  successRows.length,
      failed: failedRows.length,
      errors: failedRows.map((r) => ({ title: newJobs.find((j: any) => j.id === r.job_id)?.title, reason: r.fail_reason })),
      ...(failedRows.length > 0 && {
        message: `${successRows.length} verwerkt, ${failedRows.length} mislukt (worden opnieuw geprobeerd).`,
      }),
    });
  } catch (error: any) {
    console.error('Process route error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Unknown error' }, { status: 500 });
  }
}
