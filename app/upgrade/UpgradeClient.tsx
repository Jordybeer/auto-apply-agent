'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { CheckoutEmbed } from './CheckoutEmbed';
import type { PlanId } from '@/app/api/checkout/route';
import Link from 'next/link';
import confetti from 'canvas-confetti';

const EASE = [0.16, 1, 0.3, 1] as const;

const FEATURES = [
  { icon: '⚡', label: 'Onbeperkte AI-evaluaties per dag' },
  { icon: '✉️', label: 'Onbeperkt hoogwaardige motivatiebrieven' },
  { icon: '🤖', label: 'Sollicitaties versturen via je Gmail' },
  { icon: '🔍', label: 'Gedetailleerde vacature-analyse met scores' },
];

type Sub = {
  tier: string;
  status: string;
  current_period_end: string | null;
  trial_end: string | null;
  provider: string | null;
} | null;

interface UpgradeClientProps {
  isPremium:    boolean;
  justUpgraded: boolean;
  sub:          Sub;
  isAdmin?:     boolean;
}

// ─── Premium success screen ───────────────────────────────────────────────────
function PremiumSuccess({ sub, justUpgraded, onPortal, portalLoading }: {
  sub: Sub;
  justUpgraded: boolean;
  onPortal: () => void;
  portalLoading: boolean;
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (!justUpgraded || fired.current) return;
    fired.current = true;
    const fire = (opts: confetti.Options) =>
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.55 }, ...opts });
    fire({ colors: ['#6366f1', '#a78bfa', '#ffffff', '#fbbf24'], startVelocity: 45 });
    setTimeout(() => {
      fire({ colors: ['#34d399', '#6366f1', '#f472b6', '#ffffff'], startVelocity: 35, angle: 75 });
      fire({ colors: ['#fbbf24', '#a78bfa', '#34d399'], startVelocity: 35, angle: 105 });
    }, 300);
    setTimeout(() => confetti.reset(), 4000);
  }, [justUpgraded]);

  const periodEnd = sub?.current_period_end
    ? new Date(sub.current_period_end).toLocaleDateString('nl-BE')
    : null;

  return (
    <main className="page-shell flex flex-col items-center justify-start gap-6 pt-8 pb-24">
      <motion.div
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.05 }}
        className="flex flex-col items-center gap-3"
      >
        <motion.div
          animate={justUpgraded ? { rotate: [0, -8, 8, -4, 4, 0] } : {}}
          transition={{ delay: 0.4, duration: 0.6, ease: 'easeInOut' }}
          className="w-24 h-24 rounded-3xl flex items-center justify-center text-5xl shadow-2xl"
          style={{ background: 'linear-gradient(135deg, var(--accent) 0%, #a78bfa 100%)' }}
        >
          ⚡
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5, ease: EASE }}
          className="text-2xl font-extrabold text-center"
          style={{ color: 'var(--text)' }}
        >
          {justUpgraded ? 'Welkom bij Premium!' : 'Premium actief'}
        </motion.h1>
        {justUpgraded && (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.4, ease: EASE }}
            className="text-sm text-center"
            style={{ color: 'var(--text3)' }}
          >
            Je hebt nu toegang tot alle premium functies.
          </motion.p>
        )}
      </motion.div>

      <motion.div
        className="w-full glass-card rounded-2xl p-5 flex flex-col gap-3"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.45, ease: EASE }}
      >
        {FEATURES.map(({ icon, label }, i) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 + i * 0.08, duration: 0.35, ease: EASE }}
            className="flex items-center gap-3"
          >
            <span className="w-8 h-8 rounded-xl flex items-center justify-center text-base flex-shrink-0" style={{ background: 'var(--accent-dim)' }}>
              {icon}
            </span>
            <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{label}</span>
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.55 + i * 0.08, type: 'spring', stiffness: 300, damping: 15 }}
              className="ml-auto text-base"
              style={{ color: 'var(--green)' }}
            >
              ✓
            </motion.span>
          </motion.div>
        ))}
      </motion.div>

      <motion.div
        className="w-full glass-card rounded-2xl p-5 flex flex-col gap-2"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55, duration: 0.4, ease: EASE }}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>Status</span>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--accent-dim)', color: 'var(--accent-bright)' }}>⚡ Premium</span>
        </div>
        {periodEnd && (
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>Volgende betaling</span>
            <span className="text-xs font-medium" style={{ color: 'var(--text2)' }}>{periodEnd}</span>
          </div>
        )}
        {sub?.provider === 'stripe' && (
          <button
            onClick={onPortal}
            disabled={portalLoading}
            className="mt-1 rounded-xl py-2 text-sm font-semibold"
            style={{ background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }}
          >
            {portalLoading ? 'Laden…' : 'Abonnement beheren'}
          </button>
        )}
      </motion.div>

      <motion.div
        className="w-full"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7, duration: 0.4, ease: EASE }}
      >
        <Link
          href="/"
          className="block w-full rounded-2xl py-3.5 text-center text-base font-bold"
          style={{ background: 'linear-gradient(135deg, var(--accent) 0%, #a78bfa 100%)', color: '#fff' }}
        >
          Start met zoeken →
        </Link>
      </motion.div>
    </main>
  );
}

// ─── Main client ──────────────────────────────────────────────────────────────
export function UpgradeClient({ isPremium, justUpgraded, sub, isAdmin = false }: UpgradeClientProps) {
  const [checkoutPlan, setCheckoutPlan] = useState<PlanId | null>(null);
  const [loading, setLoading]           = useState<'portal' | 'admin' | null>(null);

  async function activateAdminPremium() {
    setLoading('admin');
    const res  = await fetch('/api/admin/set-tier', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ tier: 'premium' }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      window.location.href = '/upgrade?success=1';
    } else {
      alert(`Activatie mislukt: ${body.error ?? res.status}`);
      setLoading(null);
    }
  }

  async function openPortal() {
    setLoading('portal');
    const res = await fetch('/api/billing-portal', { method: 'POST' });
    const { url } = await res.json();
    if (url) window.location.href = url;
    else setLoading(null);
  }

  if (isPremium) {
    return (
      <PremiumSuccess
        sub={sub}
        justUpgraded={justUpgraded}
        onPortal={openPortal}
        portalLoading={loading === 'portal'}
      />
    );
  }

  const lapsed = !isPremium && sub?.tier === 'premium';

  return (
    <main className="page-shell flex flex-col gap-4">
      <div className="pt-1">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Upgrade naar Premium</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--text3)' }}>
          Onbeperkt matchen, AI-brieven en automatisch solliciteren.
        </p>
      </div>

      {lapsed && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-2xl p-4 flex items-center justify-between gap-3"
          style={{ border: '1px solid var(--border)' }}
        >
          <div>
            <p className="text-xs font-semibold" style={{ color: 'var(--text2)' }}>Vorig abonnement</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text3)' }}>
              {sub?.status === 'canceled' ? 'Opgezegd' : 'Niet actief'}
            </p>
          </div>
          {sub?.provider === 'stripe' && (
            <button
              onClick={openPortal}
              disabled={loading === 'portal'}
              className="flex-shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold"
              style={{ background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }}
            >
              {loading === 'portal' ? 'Laden…' : 'Beheren'}
            </button>
          )}
        </motion.div>
      )}

      {checkoutPlan ? (
        <CheckoutEmbed plan={checkoutPlan} onCancel={() => setCheckoutPlan(null)} />
      ) : (
        <div className="flex flex-col gap-3">

          {/* Weekly — low entry price first */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="glass-card rounded-2xl p-5"
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="font-semibold" style={{ color: 'var(--text)' }}>Wekelijks</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text3)' }}>Flexibel uitproberen, wekelijks opzegbaar</p>
              </div>
              <span className="text-xl font-bold" style={{ color: 'var(--text2)' }}>€3,99</span>
            </div>
            <button
              onClick={() => setCheckoutPlan('weekly')}
              className="w-full rounded-xl py-3 text-sm font-semibold"
              style={{ background: 'var(--accent-dim)', color: 'var(--accent-bright)' }}
            >
              Kies wekelijks
            </button>
          </motion.div>

          {/* Monthly — best deal */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.07 }}
            className="glass-card rounded-2xl p-5 relative"
            style={{ border: '1.5px solid var(--accent)' }}
          >
            <span
              className="absolute -top-2.5 left-4 text-xs font-bold px-2.5 py-0.5 rounded-full"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              BESTE DEAL
            </span>
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="font-semibold" style={{ color: 'var(--text)' }}>Maandelijks</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text3)' }}>€14,99/maand, opzeggen kan altijd</p>
              </div>
              <span className="text-xl font-bold" style={{ color: 'var(--accent-bright)' }}>€14,99</span>
            </div>
            <button
              onClick={() => setCheckoutPlan('monthly')}
              className="w-full rounded-xl py-3 text-sm font-semibold"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              Kies maandelijks
            </button>
          </motion.div>

          {/* 60-day one-time pack — below the fold, no-subscription alternative */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.14 }}
            className="glass-card rounded-2xl p-5"
            style={{ border: '1px solid var(--border)' }}
          >
            <div className="flex justify-between items-start mb-1">
              <p className="font-semibold" style={{ color: 'var(--text)' }}>60-dagen Pack</p>
              <span className="text-xl font-bold" style={{ color: 'var(--text2)' }}>€24,99</span>
            </div>
            <p className="text-xs mb-4" style={{ color: 'var(--text3)' }}>Eenmalige betaling — geen abonnement, geen verlenging</p>
            <button
              onClick={() => setCheckoutPlan('sixtydays')}
              className="w-full rounded-xl py-3 text-sm font-semibold"
              style={{ background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }}
            >
              Kies 60-dagen pack
            </button>
          </motion.div>

          {/* Admin free card */}
          {isAdmin && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.21 }}
              className="glass-card rounded-2xl p-5"
              style={{ border: '1px solid rgba(167,139,250,0.3)' }}
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="font-semibold" style={{ color: 'var(--text)' }}>Gratis voor Admins</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text3)' }}>omdat het kan 😌</p>
                </div>
                <span className="text-xl font-bold" style={{ color: '#a78bfa' }}>€0</span>
              </div>
              <button
                onClick={activateAdminPremium}
                disabled={loading === 'admin'}
                className="w-full rounded-xl py-3 text-sm font-semibold"
                style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa', opacity: loading === 'admin' ? 0.7 : 1 }}
              >
                {loading === 'admin' ? 'Activeren…' : 'Activeer gratis toegang'}
              </button>
            </motion.div>
          )}
        </div>
      )}

      <div className="glass-card rounded-2xl p-5">
        <p className="label-overline mb-3">Inbegrepen</p>
        <div className="flex flex-col gap-2">
          {FEATURES.map(({ icon, label }) => (
            <p key={label} className="text-sm flex gap-2" style={{ color: 'var(--text2)' }}>
              <span style={{ color: 'var(--green)' }}>✓</span>{label}
            </p>
          ))}
        </div>
      </div>

      <p className="text-center text-xs pb-2" style={{ color: 'var(--text4)' }}>
        Opzeggen kan altijd. Facturering via Stripe.
      </p>
      <div className="flex items-center justify-center gap-4 pb-4 flex-wrap">
        <a href="/legal/terms" className="text-xs" style={{ color: 'var(--text3)' }}>Gebruiksvoorwaarden</a>
        <span style={{ color: 'var(--text3)' }}>·</span>
        <a href="/legal/privacy" className="text-xs" style={{ color: 'var(--text3)' }}>Privacybeleid</a>
        <span style={{ color: 'var(--text3)' }}>·</span>
        <a href="mailto:contact@jordy.beer" className="text-xs" style={{ color: 'var(--text3)' }}>Contact</a>
      </div>
    </main>
  );
}
