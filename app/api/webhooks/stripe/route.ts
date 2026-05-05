import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase-service';
import { slog } from '@/lib/logger';

export const maxDuration = 30;

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY niet ingesteld');
  return new Stripe(key, { apiVersion: '2026-04-22.dahlia' });
}

async function upsertSubscription(
  service: ReturnType<typeof createServiceClient>,
  userId: string,
  sub: Stripe.Subscription,
) {
  // Stripe 22.x removed current_period_end from Subscription.
  // Use cancel_at when set (scheduled cancellation), otherwise trial_end.
  const periodEndUnix = sub.cancel_at ?? sub.trial_end ?? null;
  const periodEnd = periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null;
  const trialEnd = sub.trial_end
    ? new Date(sub.trial_end * 1000).toISOString()
    : null;

  const stripeStatus = sub.status;
  const dbStatus: 'active' | 'trialing' | 'past_due' | 'canceled' =
    stripeStatus === 'active'   ? 'active'
    : stripeStatus === 'trialing' ? 'trialing'
    : stripeStatus === 'past_due' ? 'past_due'
    : 'canceled';

  const tier: 'free' | 'premium' =
    dbStatus === 'active' || dbStatus === 'trialing' ? 'premium' : 'free';

  await service.from('subscriptions').upsert(
    {
      user_id:            userId,
      provider:           'stripe',
      provider_sub_id:    sub.id,
      tier,
      status:             dbStatus,
      current_period_end: periodEnd,
      trial_end:          trialEnd,
      updated_at:         new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const rawBody = await request.text();
  const sig = request.headers.get('stripe-signature') ?? '';

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    void slog.warn('stripe-webhook', 'Handtekening verificatie mislukt', { error: msg });
    return NextResponse.json({ error: `Webhook Error: ${msg}` }, { status: 400 });
  }

  const service = createServiceClient();

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.supabase_user_id;

        if (session.mode === 'subscription' && session.subscription && userId) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          await upsertSubscription(service, userId, sub);
          void slog.info('stripe-webhook', 'Abonnement geactiveerd via checkout', { sub_id: sub.id, user_id: userId });
        } else if (session.mode === 'payment' && session.metadata?.plan === 'sixtydays' && userId) {
          const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
          await service
            .from('user_settings')
            .update({ onetime_premium_until: expiresAt })
            .eq('user_id', userId);
          void slog.info('stripe-webhook', '60-dagen pack geactiveerd', { user_id: userId, expires_at: expiresAt });
        }
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const { data } = await service
          .from('subscriptions')
          .select('user_id')
          .eq('provider_sub_id', sub.id)
          .single();
        if (!data?.user_id) {
          void slog.warn('stripe-webhook', 'Geen gebruiker gevonden voor sub', { sub_id: sub.id });
          break;
        }
        await upsertSubscription(service, data.user_id as string, sub);
        void slog.info('stripe-webhook', `Abonnement bijgewerkt: ${event.type}`, { sub_id: sub.id, user_id: data.user_id });
        break;
      }

      default:
        break;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    void slog.error('stripe-webhook', 'Verwerking mislukt', { error: msg, event_type: event.type });
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
