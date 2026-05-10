import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import { createServiceClient } from '@/lib/supabase-service';
import { ADMIN_USER_ID } from '@/lib/env';

export const maxDuration = 10;

async function adminLog(
  level: 'log' | 'info' | 'warn' | 'error',
  message: string,
  meta?: Record<string, unknown>,
) {
  if (!ADMIN_USER_ID) return;
  try {
    const service = createServiceClient();
    await service.from('system_logs').insert({
      user_id: ADMIN_USER_ID,
      level,
      source: 'pipeline/trigger',
      message,
      meta: meta ?? null,
    });
  } catch {
    // never throw from logging
  }
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const cronSecret = process.env.CRON_SECRET;
  const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  await adminLog('info', 'Pipeline trigger started', {
    user_id:             user.id,
    cron_secret_set:     Boolean(cronSecret),
    cron_secret_length:  cronSecret?.length ?? 0,
    app_url:             appUrl,
  });

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
      await adminLog('error', `pipeline/run returned ${runRes.status}: ${errMsg}`, {
        status:  runRes.status,
        error:   errMsg,
        app_url: appUrl,
      });
      return NextResponse.json({ error: errMsg }, { status: 502 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await adminLog('error', `fetch to pipeline/run threw an exception: ${msg}`, {
      exception: msg,
      app_url:   appUrl,
    });
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  return NextResponse.json({ success: true }, { status: 202 });
}
