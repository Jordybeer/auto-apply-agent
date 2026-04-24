import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { createClient } from '@/lib/supabase-request';
import { createServiceClient } from '@/lib/supabase-service';
import { slog } from '@/lib/logger';
import type { SupabaseClient } from '@supabase/supabase-js';

export const maxDuration = 60;

interface ExistingApp { job_id: string | null; }
interface Job { id: string; title: string; company: string; description: string; url: string; }

async function processForUser(userId: string, supabase: SupabaseClient): Promise<{ count: number }> {
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
    .select('id, title, company, description, url')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (fetchError) throw fetchError;

  const newJobs = (allJobs as Job[] ?? []).filter((j) => !existingJobIds.has(j.id));
  if (newJobs.length === 0) {
    await slog.info('process', 'Alle vacatures al verwerkt', {}, userId);
    return { count: 0 };
  }

  await slog.info('process', 'Verwerking gestart', { new_jobs: newJobs.length }, userId);

  const inserts = newJobs.map((job) => ({
    user_id:              userId,
    job_id:               job.id,
    match_score:          null,
    reasoning:            '',
    cover_letter_draft:   '',
    resume_bullets_draft: [],
    status:               'draft',
  }));

  const { error: insertError } = await supabase.from('applications').insert(inserts);
  if (insertError) throw insertError;

  await slog.info('process', 'Verwerking voltooid', { inserted: inserts.length }, userId);
  return { count: inserts.length };
}

async function handleProcess(request: Request) {
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
        return NextResponse.json({ success: true, count: result.count });
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

    const result = await processForUser(user.id, supabase);
    if (result.count === 0) {
      return NextResponse.json({ success: true, count: 0, message: 'Alle vacatures zijn al verwerkt.' });
    }
    return NextResponse.json({ success: true, count: result.count });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    await slog.error('process', 'Process route fout', { error: msg });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) { return handleProcess(request); }
export async function GET(request: Request)  { return handleProcess(request); }
