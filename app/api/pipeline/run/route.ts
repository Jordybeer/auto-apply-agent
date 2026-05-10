import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import webpush from 'web-push';
import { createServiceClient } from '@/lib/supabase-service';
import { scrapeForUser } from '@/app/api/scrape/stream/route';
import { notifyTelegram } from '@/lib/telegram';
import { ADMIN_USER_ID } from '@/lib/env';

export const maxDuration = 300;

export async function POST(request: Request) {
  const vapidSubject    = process.env.VAPID_SUBJECT;
  const vapidPublicKey  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  if (vapidSubject && vapidPublicKey && vapidPrivateKey) {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  }

  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[pipeline/run] CRON_SECRET is not set');
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }

  const expected = `Bearer ${cronSecret}`;
  const actual = request.headers.get('Authorization') ?? '';

  // Admin debug logging — only when ADMIN_USER_ID is set
  if (ADMIN_USER_ID) {
    const expectedLen = expected.length;
    const actualLen   = actual.length;
    const actualPrefix = actual.startsWith('Bearer ') ? 'Bearer [REDACTED]' : `(no Bearer prefix, starts with: "${actual.slice(0, 10)}")`;
    console.log(
      `[pipeline/run] auth check | expected.length=${expectedLen} actual.length=${actualLen} | actual="${actualPrefix}" | lengths_match=${expectedLen === actualLen}`,
    );
    if (expectedLen !== actualLen) {
      const cronSecretLen = cronSecret.length;
      console.warn(
        `[pipeline/run] length mismatch → CRON_SECRET.length=${cronSecretLen} | Did the caller add/strip extra characters? Check for trailing newlines or spaces.`,
      );
    }
  }

  if (
    actual.length !== expected.length ||
    !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  ) {
    if (ADMIN_USER_ID) {
      console.error('[pipeline/run] Unauthorized — token mismatch');
    }
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
    // APNs: TODO send to device_tokens when p8 key is available

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
