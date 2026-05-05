import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { createClient } from '@/lib/supabase-request';
import { createServiceClient } from '@/lib/supabase-service';
import { slog } from '@/lib/logger';
import { scoreJob, type CvStructuredInput } from '@/lib/groq';
import { scoreJobPremium } from '@/lib/anthropic';
import type { SupabaseClient } from '@supabase/supabase-js';

export const maxDuration = 300;

const DEFAULT_THRESHOLD = 50;

interface ExistingApp { job_id: string | null; }
interface Job { id: string; title: string; company: string; description: string | null; url: string; location: string | null; }

async function processForUser(userId: string, supabase: SupabaseClient): Promise<{ count: number; scored: number; filtered: number }> {
  const { data: existingApps, error: existingError } = await supabase
    .from('applications')
    .select('job_id')
    .eq('user_id', userId);
  if (existingError) throw existingError;

  const existingJobIds = new Set<string>(
    (existingApps as ExistingApp[] ?? []).map((a) => a.job_id).filter((id): id is string => Boolean(id))
  );

  const { data: allJobs, error: fetchError } = await supabase
    .from('jobs')
    .select('id, title, company, description, url, location')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (fetchError) throw fetchError;

  const newJobs = (allJobs as Job[] ?? []).filter((j) => !existingJobIds.has(j.id));
  if (newJobs.length === 0) {
    await slog.info('process', 'Alle vacatures al verwerkt', {}, userId);
    return { count: 0, scored: 0, filtered: 0 };
  }

  const { data: settings } = await supabase
    .from('user_settings')
    .select('groq_api_key, auto_apply_threshold, cv_text, cv_structured, keywords, city, radius')
    .eq('user_id', userId)
    .single();

  const groqKey       = ((settings?.groq_api_key as string | null)?.trim()) || process.env.GROQ_API_KEY || '';
  const threshold     = Number(settings?.auto_apply_threshold ?? DEFAULT_THRESHOLD);
  const cvText        = (settings?.cv_text as string | null) ?? '';
  const cvStructured  = (settings?.cv_structured as CvStructuredInput | null) || undefined;
  const keywords      = (settings?.keywords as string[] | null)?.join(', ') || undefined;
  const userCity      = (settings?.city as string | null) || null;
  const userRadius    = typeof settings?.radius === 'number' ? settings.radius : null;

  await slog.info('process', 'Scoring gestart', { new_jobs: newJobs.length, threshold }, userId);

  const inserts: object[] = [];
  let filtered = 0;

  const useHaiku = !!process.env.ANTHROPIC_API_KEY;

  for (const job of newJobs) {
    try {
      let score: number;
      let reasoning: string;

      if (useHaiku) {
        const result = await scoreJobPremium({
          jobDescription: job.description || '',
          cvText,
          keywords: (settings?.keywords as string[] | null) ?? [],
          location: job.location || '',
        });
        score = result.score;
        reasoning = result.reasoning;
      } else if (groqKey) {
        const result = await scoreJob(
          job.description || '', job.title, job.company, groqKey,
          cvText, keywords, job.location || undefined, cvStructured, userCity, userRadius,
        );
        score = result.match_score;
        reasoning = result.reasoning;
      } else {
        inserts.push({
          user_id: userId, job_id: job.id,
          match_score: null, reasoning: '', cover_letter_draft: '', resume_bullets_draft: [], status: 'saved',
        });
        continue;
      }

      if (score >= threshold) {
        inserts.push({
          user_id: userId, job_id: job.id,
          match_score: score, reasoning,
          resume_bullets_draft: [], cover_letter_draft: '', status: 'saved',
        });
      } else {
        filtered++;
      }
    } catch {
      filtered++;
    }
  }

  if (inserts.length > 0) {
    const { error: insertError } = await supabase.from('applications').insert(inserts);
    if (insertError) throw insertError;
  }

  await slog.info('process', 'Scoring voltooid', { inserted: inserts.length, filtered }, userId);
  return { count: inserts.length, scored: newJobs.length, filtered };
}

async function handleProcess(request: Request) {
  let resolvedUserId: string | undefined;
  try {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get('authorization');

    const expectedCron = cronSecret ? `Bearer ${cronSecret}` : '';
    if (cronSecret && authHeader && authHeader.length === expectedCron.length &&
        timingSafeEqual(Buffer.from(authHeader), Buffer.from(expectedCron))) {
      const service = createServiceClient();
      const targetUserId = request.headers.get('x-user-id');
      if (targetUserId) {
        const { data: validUser } = await service
          .from('user_settings')
          .select('user_id')
          .eq('user_id', targetUserId)
          .eq('is_onboarded', true)
          .single();
        if (!validUser) return NextResponse.json({ error: 'Unknown user' }, { status: 400 });
        const result = await processForUser(targetUserId, service);
        return NextResponse.json({ success: true, ...result });
      }
      const { data: allSettings } = await service.from('user_settings').select('user_id');
      if (!allSettings?.length) return NextResponse.json({ success: true, users: 0, count: 0 });
      const results = await Promise.allSettled(
        allSettings.map((s: { user_id: string }) => processForUser(s.user_id, service))
      );
      const total = results.reduce(
        (sum, r) => sum + (r.status === 'fulfilled' ? r.value.count : 0), 0
      );
      return NextResponse.json({ success: true, users: allSettings.length, count: total });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    resolvedUserId = user.id;

    const result = await processForUser(user.id, supabase);
    if (result.count === 0) {
      return NextResponse.json({ success: true, count: 0, message: 'Alle vacatures zijn al verwerkt.' });
    }
    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    await slog.error('process', 'Process route fout', { error: msg }, resolvedUserId);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) { return handleProcess(request); }
export async function GET(request: Request)  { return handleProcess(request); }
