import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import { ADMIN_USER_ID } from '@/lib/env';

export const maxDuration = 10;

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const cronSecret = process.env.CRON_SECRET;
  const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  // Admin debug logging — only when ADMIN_USER_ID is set
  if (ADMIN_USER_ID) {
    console.log(
      `[pipeline/trigger] user=${user.id} | cronSecret set=${Boolean(cronSecret)} | cronSecret.length=${cronSecret?.length ?? 0} | appUrl=${appUrl}`,
    );
  }

  try {
    const runRes = await fetch(`${appUrl}/api/pipeline/run`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cronSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId: user.id }),
    });

    if (!runRes.ok) {
      const err = await runRes.json().catch(() => ({})) as { error?: string };
      const errMsg = err.error ?? `pipeline/run failed with status ${runRes.status}`;
      if (ADMIN_USER_ID) {
        console.error(`[pipeline/trigger] pipeline/run responded ${runRes.status}: ${errMsg}`);
      }
      return NextResponse.json(
        { error: errMsg },
        { status: 502 },
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (ADMIN_USER_ID) {
      console.error(`[pipeline/trigger] fetch to pipeline/run threw: ${msg}`);
    }
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  return NextResponse.json({ success: true }, { status: 202 });
}
