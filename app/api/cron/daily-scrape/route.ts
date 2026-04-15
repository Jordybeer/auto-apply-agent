import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-service';

export const maxDuration = 10;

const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export async function GET(request: Request) {
  if (request.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data } = await createServiceClient()
    .from('user_settings')
    .select('user_id')
    .eq('is_onboarded', true);

  for (const row of data ?? []) {
    void fetch(`${base}/api/pipeline/run`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: row.user_id }),
    });
  }

  return NextResponse.json({ dispatched: data?.length ?? 0 });
}
