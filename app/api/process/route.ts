import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import { evaluateJob, GroqRateLimitError } from '@/lib/openai';
import { extractCvText } from '@/lib/parse-cv';

export const maxDuration = 60;

export async function POST() { return handleProcess(); }
export async function GET()  { return handleProcess(); }

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface ExistingApp { job_id: string | null; }
interface Job { id: string; title: string; company: string; description: string; url: string; }
interface InsertedApp { id: string; job_id: string; }

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
      status:               'draft',
    }));

    const { data: inserted, error: insertError } = await supabase
      .from('applications')
      .insert(inserts)
      .select('id, job_id');
    if (insertError) throw insertError;

    const { data: settings } = await supabase
      .from('user_settings')
      .select('groq_api_key')
      .eq('user_id', user.id)
      .single();

    const groqKey = settings?.groq_api_key || '';

    if (groqKey) {
      let cvText = '';
      try {
        const { data: signedData } = await supabase.storage
          .from('resumes')
          .createSignedUrl(`${user.id}/cv.pdf`, 120);
        if (signedData?.signedUrl) {
          const pdfRes = await fetch(signedData.signedUrl);
          const buf = Buffer.from(await pdfRes.arrayBuffer());
          cvText = await extractCvText(buf);
        }
      } catch (cvErr) {
        console.warn('CV extraction failed during process:', cvErr);
      }

      const appIdByJobId = new Map<string, string>(
        (inserted as InsertedApp[] ?? []).map((a) => [a.job_id, a.id])
      );
      const jobMap = new Map<string, Job>(newJobs.map((j) => [j.id, j]));

      const entries = [...appIdByJobId.entries()];
      const BATCH = 3;
      const BATCH_SLEEP_MS = 500;

      for (let i = 0; i < entries.length; i += BATCH) {
        if (i > 0) await sleep(BATCH_SLEEP_MS);
        const results = await Promise.allSettled(
          entries.slice(i, i + BATCH).map(async ([jobId, appId]) => {
            const job = jobMap.get(jobId);
            if (!job) return;
            const ev = await evaluateJob(
              job.description || '',
              job.title || '',
              job.company || '',
              groqKey,
              cvText,
            );
            await supabase
              .from('applications')
              .update({
                match_score:          ev.match_score ?? 0,
                reasoning:            ev.reasoning ?? '',
                cover_letter_draft:   ev.cover_letter_draft ?? '',
                resume_bullets_draft: ev.resume_bullets_draft ?? [],
              })
              .eq('id', appId)
              .eq('user_id', user.id);
          })
        );

        // If any job in the batch hit a rate limit, stop processing and surface the error.
        for (const result of results) {
          if (result.status === 'rejected' && result.reason instanceof GroqRateLimitError) {
            return NextResponse.json(
              { success: false, error: result.reason.message, code: 'RATE_LIMIT', count: i },
              { status: 429 },
            );
          }
        }
      }
    }

    return NextResponse.json({ success: true, count: inserts.length, failed: 0 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Process route error:', error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
