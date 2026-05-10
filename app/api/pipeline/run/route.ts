import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import webpush from 'web-push';
import { createServiceClient } from '@/lib/supabase-service';
import { scrapeForUser } from '@/app/api/scrape/stream/route';
import { notifyTelegram } from '@/lib/telegram';
import { ADMIN_USER_ID } from '@/lib/env';

export const maxDuration = 300;

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
      source: 'pipeline/run',
      message,
      meta: meta ?? null,
    });
  } catch {
    // never throw from logging
  }
}

export async function POST(request: Request) {
  const vapidSubject    = process.env.VAPID_SUBJECT;
  const vapidPublicKey  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  if (vapidSubject && vapidPublicKey && vapidPrivateKey) {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  }

  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    await adminLog('error', 'CRON_SECRET env var is not set — pipeline cannot authenticate');
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }

  const expected = `Bearer ${cronSecret}`;
  const actual   = request.headers.get('Authorization') ?? '';

  const expectedLen = expected.length;
  const actualLen   = actual.length;
  const hasPrefix   = actual.startsWith('Bearer ');

  await adminLog('info', 'Auth check', {
    expected_length: expectedLen,
    actual_length:   actualLen,
    lengths_match:   expectedLen === actualLen,
    has_bearer_prefix: hasPrefix,
    cron_secret_length: cronSecret.length,
  });

  if (expectedLen !== actualLen) {
    await adminLog('warn',
      `Token length mismatch: expected ${expectedLen} chars, got ${actualLen}. ` +
      `CRON_SECRET is ${cronSecret.length} chars. ` +
      `Check for trailing newline/space in the env var or the caller.`,
      { expected_length: expectedLen, actual_length: actualLen, cron_secret_length: cronSecret.length },
    );
  }

  if (
    actual.length !== expected.length ||
    !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  ) {
    await adminLog('error', 'Unauthorized — token mismatch. Check CRON_SECRET consistency between trigger and run.', {
      has_bearer_prefix: hasPrefix,
      actual_length:     actualLen,
      expected_length:   expectedLen,
    });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as { userId?: unknown };
  const { userId } = body;
  if (!userId || typeof userId !== 'string') {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }
  const service = createServiceClient();

  const [{ data: userRow }, { data: sub }] = await Promise.all([
    service.from('user_settings').select('user_id').eq('user_id', userId).eq('is_onboarded', true).eq('is_active', true).single(),
    service.from('push_subscriptions').select('subscription').eq('user_id', userId).maybeSingle(),
  ]);

  if (!userRow) return NextResponse.json({ error: 'Unknown user' }, { status: 400 });

  let count = 0;
  try {
    count = await scrapeForUser(userId, service);

    const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const processRes = await fetch(`${appUrl}/api/process`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cronSecret}`,
        'x-user-id': userId,
      },
    });
    const processData = processRes.ok
      ? await processRes.json() as { count?: number }
      : { count: 0 };
    const processed = processData.count ?? 0;

    if (count > 0 && sub) {
      webpush.sendNotification(
        sub.subscription,
        JSON.stringify({
          title: 'Nieuwe vacatures gevonden 🎯',
          body: `${count} nieuwe jobs klaar.`,
          data: { url: '/queue' },
        }),
      ).catch((err: unknown) => {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 410 || status === 404) {
          service.from('push_subscriptions').delete().eq('user_id', userId).then(() => {});
        }
      });
    }

    if (count > 0) {
      service.from('notifications').insert({
        user_id: userId,
        title: 'Nieuwe vacatures gevonden',
        body: `${count} nieuwe job${count === 1 ? '' : 's'} klaar voor beoordeling.`,
        url: '/queue',
      }).then(() => {});
    }

    void notifyTelegram(
      `✅ *Pipeline klaar*\n\n📥 Gevonden: *${count}*  |  🗂 Verwerkt: *${processed}*`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    void notifyTelegram(`❌ *Pipeline fout*\n\n\`${msg.slice(0, 300)}\``);
    throw err;
  }

  return NextResponse.json({ success: true, count });
}
