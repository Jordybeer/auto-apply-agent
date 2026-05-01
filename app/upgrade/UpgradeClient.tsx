'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';

type Sub = {
  tier: string;
  status: string;
  current_period_end: string | null;
  trial_end: string | null;
  provider: string | null;
} | null;

interface UpgradeClientProps {
  isPremium: boolean;
  justUpgraded: boolean;
  sub: Sub;
}

export function UpgradeClient({ isPremium, justUpgraded, sub }: UpgradeClientProps) {
  const [loading, setLoading] = useState<'weekly' | 'monthly' | 'portal' | null>(null);

  async function checkout(plan: 'weekly' | 'monthly') {
    setLoading(plan);
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan }),
    });
    const { url } = await res.json();
    if (url) window.location.href = url;
    else setLoading(null);
  }

  async function openPortal() {
    setLoading('portal');
    const res = await fetch('/api/billing-portal', { method: 'POST' });
    const { url } = await res.json();
    if (url) window.location.href = url;
    else setLoading(null);
  }

  if (isPremium) {
    const periodEnd = sub?.current_period_end
      ? new Date(sub.current_period_end).toLocaleDateString('nl-BE')
      : '—';
    const isTrial = sub?.status === 'trialing';

    return (
      <main className="page-shell flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Jouw abonnement</h1>
        </div>
        <div className="glass-card rounded-2xl p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl">⚡</span>
            <span className="text-lg font-bold" style={{ color: 'var(--accent-bright)' }}>
              {justUpgraded ? 'Welkom bij Premium!' : 'Premium actief'}
            </span>
          </div>
          {isTrial && sub?.trial_end && (
            <p className="text-sm" style={{ color: 'var(--text3)' }}>
              Gratis proefperiode t/m {new Date(sub.trial_end).toLocaleDateString('nl-BE')}
            </p>
          )}
          <p className="text-sm" style={{ color: 'var(--text3)' }}>
            Volgende betaling: {periodEnd}
          </p>
          {sub?.provider === 'stripe' && (
            <button
              onClick={openPortal}
              disabled={loading === 'portal'}
              className="mt-2 rounded-xl py-2.5 text-sm font-semibold"
              style={{ background: 'var(--accent-dim)', color: 'var(--accent-bright)' }}
            >
              {loading === 'portal' ? 'Laden…' : 'Abonnement beheren'}
            </button>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Upgrade naar Premium</h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text3)' }}>
          Onbeperkt matchen, AI-brieven en automatisch solliciteren.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {/* Monthly — marked as best deal */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="glass-card rounded-2xl p-4 relative"
          style={{ border: '1.5px solid var(--accent)' }}
        >
          <span
            className="absolute -top-2.5 left-4 text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            BESTE DEAL
          </span>
          <div className="flex justify-between items-start mb-3">
            <div>
              <p className="font-semibold" style={{ color: 'var(--text)' }}>Maandelijks</p>
              <p className="text-xs" style={{ color: 'var(--text3)' }}>7 dagen gratis, dan €9,99/maand</p>
            </div>
            <span className="text-xl font-bold" style={{ color: 'var(--accent-bright)' }}>€9,99</span>
          </div>
          <button
            onClick={() => checkout('monthly')}
            disabled={!!loading}
            className="w-full rounded-xl py-2.5 text-sm font-semibold"
            style={{ background: 'var(--accent)', color: '#fff', opacity: loading ? 0.7 : 1 }}
          >
            {loading === 'monthly' ? 'Laden…' : 'Start gratis proefperiode'}
          </button>
        </motion.div>

        {/* Weekly */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.07 }}
          className="glass-card rounded-2xl p-4"
        >
          <div className="flex justify-between items-start mb-3">
            <div>
              <p className="font-semibold" style={{ color: 'var(--text)' }}>Wekelijks</p>
              <p className="text-xs" style={{ color: 'var(--text3)' }}>Geen proefperiode</p>
            </div>
            <span className="text-xl font-bold" style={{ color: 'var(--text2)' }}>€2,99</span>
          </div>
          <button
            onClick={() => checkout('weekly')}
            disabled={!!loading}
            className="w-full rounded-xl py-2.5 text-sm font-semibold"
            style={{ background: 'var(--accent-dim)', color: 'var(--accent-bright)', opacity: loading ? 0.7 : 1 }}
          >
            {loading === 'weekly' ? 'Laden…' : 'Kies wekelijks'}
          </button>
        </motion.div>
      </div>

      <div className="glass-card rounded-2xl p-4">
        <p className="label-overline mb-2">Inbegrepen</p>
        <div className="flex flex-col gap-1.5">
          {[
            'Onbeperkte AI-matching',
            'Motivatiebrieven via Claude Sonnet',
            'Automatisch solliciteren per e-mail',
            'Dagelijkse vacaturescan',
          ].map(f => (
            <p key={f} className="text-sm flex gap-2" style={{ color: 'var(--text2)' }}>
              <span style={{ color: 'var(--green)' }}>✓</span>{f}
            </p>
          ))}
        </div>
      </div>

      <p className="text-center text-xs pb-2" style={{ color: 'var(--text4)' }}>
        Opzeggen kan altijd. Facturering via Stripe.
      </p>
    </main>
  );
}
