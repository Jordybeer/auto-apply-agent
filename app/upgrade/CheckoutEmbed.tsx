'use client';

import { useEffect, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

export function CheckoutEmbed({ plan, onCancel }: { plan: 'weekly' | 'monthly'; onCancel: () => void }) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/checkout', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ plan }),
    })
      .then(r => r.json())
      .then((d: { clientSecret?: string; error?: string }) => {
        if (d.clientSecret) setClientSecret(d.clientSecret);
        else setError(d.error ?? 'Onbekende fout');
      })
      .catch(() => setError('Verbinding mislukt.'));
  }, [plan]);

  if (error) return (
    <div className="glass-card rounded-2xl p-4 text-sm" style={{ color: 'var(--red)' }}>
      {error}
      <button onClick={onCancel} className="block mt-2 text-xs" style={{ color: 'var(--text3)' }}>Terug</button>
    </div>
  );

  if (!clientSecret) return (
    <div className="glass-card rounded-2xl p-6 flex justify-center">
      <div className="animate-spin rounded-full h-6 w-6 border-2" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
    </div>
  );

  return (
    <div>
      <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
      <button
        onClick={onCancel}
        className="mt-3 w-full text-center text-xs"
        style={{ color: 'var(--text4)' }}
      >
        Annuleren
      </button>
    </div>
  );
}
