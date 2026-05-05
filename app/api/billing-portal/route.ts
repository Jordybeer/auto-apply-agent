import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase-request';
import { createServiceClient } from '@/lib/supabase-service';
import { slog } from '@/lib/logger';

export const maxDuration = 30;

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY niet ingesteld');
  return new Stripe(key, { apiVersion: '2026-04-22.dahlia' });
}

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const service = createServiceClient();
    const { data: sub } = await service
      .from('subscriptions')
      .select('provider, provider_sub_id')
      .eq('user_id', user.id)
      .single();

    if (!sub || sub.provider !== 'stripe' || !sub.provider_sub_id) {
      return NextResponse.json({ error: 'Geen Stripe-abonnement gevonden.' }, { status: 404 });
    }

    const stripe = getStripe();
    // Retrieve the Stripe subscription to get the customer id.
    const stripeSub = await stripe.subscriptions.retrieve(sub.provider_sub_id as string);
    const customerId = typeof stripeSub.customer === 'string'
      ? stripeSub.customer
      : stripeSub.customer.id;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/settings`,
    });

    void slog.info('billing-portal', 'Portal sessie aangemaakt', { customer_id: customerId }, user.id);
    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    void slog.error('billing-portal', 'Portal route fout', { error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
