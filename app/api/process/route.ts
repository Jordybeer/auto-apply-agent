import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import { evaluateJob } from '@/lib/openai';
import { extractCvText } from '@/lib/parse-cv';

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
      .select('id, title, company, description, url')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200);
    if (fetchError) throw fetchError;

    const newJobs = (allJobs ?? []).filter((j: any) => !existingJobIds.has(j.id));
    if (newJobs.length === 0)
      return NextResponse.json({ success: true, count: 0, message: 'Alle vacatures zijn al verwerkt.' });

    // Insert with null scores first so they appear immediately in the queue
    const inserts = newJobs.map((job: any) => ({
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

    // Fetch Groq key + CV once, then score each job
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

      // Build a lookup: job_id -> inserted application id
      const appIdByJobId = new Map<string, string>(
        (inserted ?? []).map((a: any) => [a.job_id, a.id])
      );

      const jobMap = new Map<string, any>(newJobs.map((j: any) => [j.id, j]));

      // Score sequentially to avoid hammering the Groq API
      for (const [jobId, appId] of appIdByJobId) {
        const job = jobMap.get(jobId);
        if (!job) continue;
        try {
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
        } catch (scoreErr) {
          console.warn(`Scoring failed for job ${jobId}:`, scoreErr);
          // Non-fatal — job stays in queue with null score / ⏳
        }
      }
    }

    return NextResponse.json({ success: true, count: inserts.length, failed: 0 });
  } catch (error: any) {
    console.error('Process route error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Unknown error' }, { status: 500 });
  }
}
