import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { createServiceClient } from '@/lib/supabase-service';
import { scrapeForUser } from '@/app/api/scrape/stream/route';

export const maxDuration = 300;

export async function POST(request: Request) {
  const vapidSubject    = process.env.VAPID_SUBJECT;
  const vapidPublicKey  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  if (vapidSubject && vapidPublicKey && vapidPrivateKey) {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  }
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  const auth = request.headers.get('Authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { userId } = await request.json();
  if (!userId || typeof userId !== 'string') {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }
  const service = createServiceClient();

  const [{ data: userRow }, { data: sub }] = await Promise.all([
    service.from('user_settings').select('user_id').eq('user_id', userId).eq('is_onboarded', true).eq('is_active', true).single(),
    service.from('push_subscriptions').select('subscription').eq('user_id', userId).maybeSingle(),
  ]);

  if (!userRow) return NextResponse.json({ error: 'Unknown user' }, { status: 400 });

  const count = await scrapeForUser(userId, service);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  await fetch(`${appUrl}/api/process`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
      'x-user-id': userId,
    },
  });

  if (count > 0 && sub) {
    webpush.sendNotification(
      sub.subscription,
      JSON.stringify({
        title: 'Nieuwe vacatures gevonden \uD83C\uDFAF',
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

  return NextResponse.json({ success: true, count });
}
