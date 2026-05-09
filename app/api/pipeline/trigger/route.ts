import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';

export const maxDuration = 10;

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  // Await the run invocation so errors are surfaced to the caller instead of
  // being swallowed silently. pipeline/run has maxDuration=300 so this will
  // block for up to 5 min — acceptable because this endpoint itself has
  // maxDuration=10 and Vercel will return a 504 to the client after that,
  // but the run invocation continues independently on its own serverless instance.
  try {
    const runRes = await fetch(`${appUrl}/api/pipeline/run`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.CRON_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId: user.id }),
    });

    if (!runRes.ok) {
      const err = await runRes.json().catch(() => ({})) as { error?: string };
      return NextResponse.json(
        { error: err.error ?? `pipeline/run failed with status ${runRes.status}` },
        { status: 502 },
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  return NextResponse.json({ success: true }, { status: 202 });
}
