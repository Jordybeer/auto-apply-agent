import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase-request';
import { slog } from '@/lib/logger';

export const maxDuration = 30;

export type PlanId = 'weekly' | 'monthly' | 'sixtydays';

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY niet ingesteld');
  return new Stripe(key, { apiVersion: '2026-04-22.dahlia' });
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const { plan } = await request.json() as { plan: PlanId };
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
    const stripe  = getStripe();

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    const customer  = customers.data[0]
      ?? await stripe.customers.create({ email: user.email!, metadata: { supabase_user_id: user.id } });

    // ── One-time 60-day pack ──────────────────────────────────────────────────
    if (plan === 'sixtydays') {
      const session = await stripe.checkout.sessions.create({
        customer:             customer.id,
        mode:                 'payment',
        payment_method_types: ['card'],
        line_items: [{
          quantity: 1,
          price_data: {
            currency:     'eur',
            unit_amount:  2499,          // €24,99
            product_data: {
              name:        '60 dagen Premium',
              description: 'Eenmalige betaling — 60 dagen volledige toegang',
            },
          },
        }],
        allow_promotion_codes: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ui_mode:    'embedded' as any,
        return_url: `${appUrl}/upgrade?success=1`,
        metadata:   { supabase_user_id: user.id, plan: 'sixtydays' },
      });
      void slog.info('checkout', '60-dagenpack sessie aangemaakt', { session_id: session.id }, user.id);
      return NextResponse.json({ clientSecret: session.client_secret });
    }

    // ── Recurring subscriptions ───────────────────────────────────────────────
    const PRICES: Record<string, string | undefined> = {
      weekly:  process.env.STRIPE_PRICE_WEEKLY,
      monthly: process.env.STRIPE_PRICE_MONTHLY,
    };
    const priceId = PRICES[plan];
    if (!priceId) return NextResponse.json({ error: 'Ongeldig abonnement' }, { status: 400 });

    const session = await stripe.checkout.sessions.create({
      customer:              customer.id,
      mode:                  'subscription',
      payment_method_types:  ['card'],
      line_items:            [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ui_mode:               'embedded' as any,
      return_url:            `${appUrl}/upgrade?success=1`,
      metadata:              { supabase_user_id: user.id, plan },
    });

    void slog.info('checkout', 'Checkout sessie aangemaakt', { session_id: session.id, plan }, user.id);
    return NextResponse.json({ clientSecret: session.client_secret });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    void slog.error('checkout', 'Checkout route fout', { error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
