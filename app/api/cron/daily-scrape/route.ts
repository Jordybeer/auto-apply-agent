import { NextResponse, after } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { createServiceClient } from '@/lib/supabase-service';
import { slog } from '@/lib/logger';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const base = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    void slog.error('daily-scrape', 'CRON_SECRET not configured');
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  const actual = request.headers.get('Authorization') ?? '';
  if (actual.length !== expected.length ||
      !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) {
    void slog.warn('daily-scrape', 'Unauthorized cron hit', { ua: request.headers.get('user-agent') ?? null });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await slog.info('daily-scrape', 'Cron gestart');

  const { data, error } = await createServiceClient()
    .from('user_settings')
    .select('user_id')
    .eq('is_onboarded', true)
    .eq('daily_scrape_enabled', true)
    .eq('is_active', true);

  if (error) {
    await slog.error('daily-scrape', 'User-settings query mislukt', { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const targets = data ?? [];
  await slog.info('daily-scrape', 'Pipelines klaar voor dispatch', { count: targets.length });

  // after() keeps the function alive past the HTTP response so fire-and-forget
  // fetches actually leave the runtime — fixes the silent-failure mode where the
  // cron returned in <1s and the platform tore down before any dispatch flew.
  after(async () => {
    let dispatched = 0;
    let failed = 0;
    await Promise.allSettled(targets.map(async (row) => {
      try {
        const res = await fetch(`${base}/api/pipeline/run`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.CRON_SECRET}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: row.user_id }),
        });
        if (!res.ok) {
          failed++;
          await slog.warn('daily-scrape', 'Pipeline dispatch mislukt', { userId: row.user_id, status: res.status });
        } else {
          dispatched++;
        }
      } catch (err) {
        failed++;
        await slog.error('daily-scrape', 'Pipeline dispatch fout', { userId: row.user_id, error: String(err) });
      }
    }));
    await slog.info('daily-scrape', 'Cron klaar', { dispatched, failed, total: targets.length });
  });

  return NextResponse.json({ dispatched: targets.length });
}
