import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-service';
import { slog } from '@/lib/logger';

export const maxDuration = 10;

const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  if (request.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data } = await createServiceClient()
    .from('user_settings')
    .select('user_id')
    .eq('is_onboarded', true)
    .eq('daily_scrape_enabled', true)
    .eq('is_active', true);

  for (const row of data ?? []) {
    void fetch(`${base}/api/pipeline/run`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: row.user_id }),
    }).then(res => {
      if (!res.ok) void slog.warn('daily-scrape', 'Pipeline dispatch mislukt', { userId: row.user_id, status: res.status });
    }).catch(err => {
      void slog.error('daily-scrape', 'Pipeline dispatch fout', { userId: row.user_id, error: String(err) });
    });
  }

  return NextResponse.json({ dispatched: data?.length ?? 0 });
}
