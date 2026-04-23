import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { createServiceClient } from '@/lib/supabase-service';
import { notifyTelegram, escTg } from '@/lib/telegram';
import { slog } from '@/lib/logger';

export const maxDuration = 30;

interface AppWithJob {
  id: string;
  match_score: number | null;
  approval_requested_at: string | null;
  jobs: { title: string; company: string } | null;
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  const actual   = request.headers.get('Authorization') ?? '';
  if (actual.length !== expected.length ||
      !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminUserId = process.env.ADMIN_USER_ID;
  if (!adminUserId) return NextResponse.json({ error: 'ADMIN_USER_ID not set' }, { status: 500 });

  const supabase  = createServiceClient();
  const since12h  = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const [
    { count: newJobs },
    { count: appliedCount },
    { data: highScore },
    { data: stale },
  ] = await Promise.all([
    supabase.from('jobs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', adminUserId)
      .gte('created_at', since12h),
    supabase.from('applications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', adminUserId)
      .eq('status', 'applied')
      .gte('applied_at', since12h),
    supabase.from('applications')
      .select('id, match_score, jobs(title, company)')
      .eq('user_id', adminUserId)
      .in('status', ['draft', 'saved'])
      .not('match_score', 'is', null)
      .gte('match_score', 85)
      .order('match_score', { ascending: false })
      .limit(5),
    supabase.from('applications')
      .select('id, match_score, approval_requested_at, jobs(title, company)')
      .eq('user_id', adminUserId)
      .in('status', ['draft', 'saved'])
      .not('approval_requested_at', 'is', null)
      .lt('approval_requested_at', oneHourAgo),
  ]);

  // Expire stale approval requests
  if (stale?.length) {
    const staleIds = (stale as unknown as AppWithJob[]).map((a) => a.id);
    await supabase.from('applications')
      .update({ status: 'skipped', approval_requested_at: null })
      .in('id', staleIds)
      .eq('user_id', adminUserId);

    const names = (stale as unknown as AppWithJob[])
      .map((a) => `• ${escTg(a.jobs?.title)} @ ${escTg(a.jobs?.company)}`)
      .join('\n');
    void notifyTelegram(`⏰ *${stale.length} goedkeuringsverzoek(en) verlopen — overgeslagen:*\n\n${names}`);
    void slog.info('briefing', 'Verlopen goedkeuringen overgeslagen', { count: stale.length });
  }

  // Build morning summary
  let msg = `☀️ *Ochtendoverzicht*\n\n`;
  msg += `📥 Nieuwe vacatures (12u): *${newJobs ?? 0}*\n`;
  msg += `✅ Sollicitaties verstuurd: *${appliedCount ?? 0}*\n`;

  if (highScore?.length) {
    msg += `\n🏆 *Top matches wachten op beoordeling:*\n`;
    (highScore as unknown as AppWithJob[]).forEach((a) => {
      msg += `• *${escTg(a.jobs?.title)}* @ ${escTg(a.jobs?.company)} — ${a.match_score}%\n`;
    });
  } else {
    msg += `\n_Geen vacatures boven 85% in de wachtrij._`;
  }

  void notifyTelegram(msg);
  void slog.info('briefing', 'Ochtendoverzicht verstuurd', { new_jobs: newJobs, applied: appliedCount });

  return NextResponse.json({ ok: true, new_jobs: newJobs, applied: appliedCount, expired: stale?.length ?? 0 });
}
