import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase-request';
import { slog } from '@/lib/logger';

export const maxDuration = 30;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2026-04-22.dahlia' });

const PRICES: Record<string, string | undefined> = {
  weekly:  process.env.STRIPE_PRICE_WEEKLY,
  monthly: process.env.STRIPE_PRICE_MONTHLY,
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const { plan } = await request.json() as { plan: 'weekly' | 'monthly' };
    const priceId = PRICES[plan];
    if (!priceId) return NextResponse.json({ error: 'Ongeldig abonnement' }, { status: 400 });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    const customer = customers.data[0]
      ?? await stripe.customers.create({ email: user.email!, metadata: { supabase_user_id: user.id } });

    const session = await stripe.checkout.sessions.create({
      customer:              customer.id,
      mode:                  'subscription',
      payment_method_types:  ['card'],
      line_items:            [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ui_mode:               'embedded' as any,
      return_url:            `${appUrl}/upgrade?success=1`,
      metadata:              { supabase_user_id: user.id },
    });

    void slog.info('checkout', 'Checkout sessie aangemaakt', { session_id: session.id, plan }, user.id);
    return NextResponse.json({ clientSecret: session.client_secret });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    void slog.error('checkout', 'Checkout route fout', { error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
