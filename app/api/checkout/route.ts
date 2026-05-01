import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase-request';
import { slog } from '@/lib/logger';

export const maxDuration = 30;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2026-04-22.dahlia' });

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const priceId = process.env.STRIPE_PREMIUM_PRICE_ID;
    if (!priceId) return NextResponse.json({ error: 'Stripe price not configured' }, { status: 500 });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { user_id: user.id },
      success_url: `${appUrl}/settings?checkout=success`,
      cancel_url:  `${appUrl}/settings?checkout=cancel`,
    });

    void slog.info('checkout', 'Checkout sessie aangemaakt', { session_id: session.id }, user.id);
    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    void slog.error('checkout', 'Checkout route fout', { error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
