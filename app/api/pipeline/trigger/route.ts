import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import { createServiceClient } from '@/lib/supabase-service';
import { ADMIN_USER_ID } from '@/lib/env';
import { scrapeForUser } from '@/app/api/scrape/stream/route';
import { processForUser } from '@/app/api/process/route';
import webpush from 'web-push';
import { notifyTelegram } from '@/lib/telegram';

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

  // Set up web push if configured
  const vapidSubject    = process.env.VAPID_SUBJECT;
  const vapidPublicKey  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  if (vapidSubject && vapidPublicKey && vapidPrivateKey) {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  }

  await adminLog('info', 'Pipeline trigger started (direct)', { user_id: user.id });

  const service = createServiceClient();
  let scrapeCount = 0;
  let processCount = 0;

  try {
    scrapeCount = await scrapeForUser(user.id, service);
    await adminLog('info', `Scrape done: ${scrapeCount} new jobs`, { scrape_count: scrapeCount, user_id: user.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await adminLog('error', `scrapeForUser threw: ${msg}`, { exception: msg, user_id: user.id });
    void notifyTelegram(`❌ *Pipeline fout (scrape)*\n\n\`${msg.slice(0, 300)}\``);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  try {
    const result = await processForUser(user.id, service);
    processCount = result.count;
    await adminLog('info', `Process done: ${processCount} applications created`, { process_count: processCount, user_id: user.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await adminLog('error', `processForUser threw: ${msg}`, { exception: msg, user_id: user.id });
    void notifyTelegram(`❌ *Pipeline fout (process)*\n\n\`${msg.slice(0, 300)}\``);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Push notification
  if (scrapeCount > 0) {
    const { data: sub } = await service
      .from('push_subscriptions')
      .select('subscription')
      .eq('user_id', user.id)
      .maybeSingle();

    if (sub) {
      webpush.sendNotification(
        sub.subscription,
        JSON.stringify({
          title: 'Nieuwe vacatures gevonden 🎯',
          body: `${scrapeCount} nieuwe jobs klaar.`,
          data: { url: '/queue' },
        }),
      ).catch((err: unknown) => {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 410 || status === 404) {
          service.from('push_subscriptions').delete().eq('user_id', user.id).then(() => {});
        }
      });
    }

    service.from('notifications').insert({
      user_id: user.id,
      title: 'Nieuwe vacatures gevonden',
      body: `${scrapeCount} nieuwe job${scrapeCount === 1 ? '' : 's'} klaar voor beoordeling.`,
      url: '/queue',
    }).then(() => {});
  }

  void notifyTelegram(
    `✅ *Pipeline klaar*\n\n📥 Gevonden: *${scrapeCount}*  |  🗂 Verwerkt: *${processCount}*`,
  );

  return NextResponse.json({ success: true, scrape_count: scrapeCount, process_count: processCount }, { status: 200 });
}
