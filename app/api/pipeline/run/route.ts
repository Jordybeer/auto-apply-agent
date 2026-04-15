import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { createServiceClient } from '@/lib/supabase-service';
import { scrapeForUser } from '@/app/api/scrape/stream/route';

export const maxDuration = 300;

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

export async function POST(request: Request) {
  const auth = request.headers.get('Authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { userId } = await request.json();
  const service = createServiceClient();

  const [, { data: sub }] = await Promise.all([
    service.from('user_settings').select('user_id').eq('user_id', userId).single(),
    service.from('push_subscriptions').select('subscription').eq('user_id', userId).maybeSingle(),
  ]);

  const count = await scrapeForUser(userId, service);

  await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/process`, {
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
    ).catch(() => {});
  }

  return NextResponse.json({ success: true, count });
}
