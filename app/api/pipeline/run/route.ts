import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { createServiceClient } from '@/lib/supabase-service';
import { scrapeForUser } from '@/app/api/scrape/stream/route';

export const maxDuration = 60;

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export async function POST(request: Request) {
  const auth = request.headers.get('Authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { userId } = await request.json();
  const service = createServiceClient();

  const [{ data: settings }, { data: sub }] = await Promise.all([
    service.from('user_settings').select('keywords,city,radius').eq('user_id', userId).single(),
    service.from('push_subscriptions').select('subscription').eq('user_id', userId).maybeSingle(),
  ]);

  const count = await scrapeForUser(userId, service);

  await fetch(`${base}/api/process`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  });

  if (count > 0 && sub) {
    webpush.sendNotification(
      sub.subscription,
      JSON.stringify({ title: 'Nieuwe vacatures gevonden 🎯', body: `${count} nieuwe jobs klaar.`, data: { url: '/queue' } }),
    ).catch(() => {});
  }

  return NextResponse.json({ success: true, count });
}
