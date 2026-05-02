import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';

export const maxDuration = 10;

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  // Fire-and-forget: pipeline/run has maxDuration=300 and runs as its own
  // serverless invocation — returning here does not abort it.
  fetch(`${appUrl}/api/pipeline/run`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ userId: user.id }),
  }).catch(() => {});

  return NextResponse.json({ success: true }, { status: 202 });
}
