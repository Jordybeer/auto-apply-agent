'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState, useMemo } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { motion, AnimatePresence } from 'framer-motion';
import { HelpCircle, Loader2, RefreshCw, Mail, ChevronRight, Zap, X } from 'lucide-react';
import Link from 'next/link';
import SettingsMenu from '@/components/SettingsMenu';
import NotificationToggle from '@/components/NotificationToggle';
import LegalLinks from '@/components/LegalLinks';
import { WALKTHROUGH_KEY } from '@/components/OnboardingWalkthrough';

const EASE = [0.16, 1, 0.3, 1] as const;

const PREMIUM_FEATURES = [
  { icon: '⚡', label: 'Onbeperkte AI-evaluaties per dag' },
  { icon: '✉️', label: 'Motivatiebrieven via Claude Sonnet' },
  { icon: '🤖', label: 'Sollicitaties versturen via je Gmail' },
  { icon: '🔍', label: 'Diepgaande job-analyse per vacature' },
];

export default function SettingsPage() {
  const supabase = useMemo(
    () => createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    ),
    []
  );

  const [email, setEmail]     = useState<string | null>(null);
  const [avatar, setAvatar]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setEmail(data.user.email ?? null);
        setAvatar(data.user.user_metadata?.avatar_url ?? null);
      }
      setLoading(false);
    });
  }, [supabase]);

  return (
    <main className="page-shell flex flex-col gap-5" style={{ position: 'relative', zIndex: 1 }}>
      <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>
        Instellingen
      </h1>

      {!loading && email && (
        <UserCard email={email} avatar={avatar} supabase={supabase} />
      )}

      <PremiumSection />

      <NotificationToggle />

      <DailyScrapeToggle />

      <EmailSettingsButton />

      <WalkthroughButton />

      <div data-walkthrough="instellingen-menu">
        <SettingsMenu />
      </div>

      <LegalLinks className="mt-4" />
      <VersionFooter />
    </main>
  );
}

function VersionFooter() {
  const v = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0';
  const onCopy = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(`web/${v}`).catch(() => {});
    }
  };
  return (
    <button
      onClick={onCopy}
      className="self-center text-xs opacity-60 hover:opacity-100 transition-opacity mt-4 mb-2"
      style={{ color: 'var(--text2)', background: 'none', border: 'none', cursor: 'pointer' }}
      aria-label="Versie kopiëren"
    >
      v{v}
    </button>
  );
}

// ─── Cancel confirmation modal ────────────────────────────────────────────────
function CancelModal({ onConfirm, onClose, loading }: {
  onConfirm: () => void;
  onClose:   () => void;
  loading:   boolean;
}) {
  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-end justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="absolute inset-0"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={onClose}
        />
        <motion.div
          className="relative w-full max-w-lg glass-card rounded-t-3xl p-6 flex flex-col gap-5"
          style={{ zIndex: 1 }}
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 32 }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>Abonnement opzeggen?</h2>
              <p className="text-xs mt-1" style={{ color: 'var(--text3)' }}>
                Je verliest direct toegang tot de volgende functies:
              </p>
            </div>
            <button onClick={onClose} style={{ color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
              <X size={18} />
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {PREMIUM_FEATURES.map(({ icon, label }) => (
              <div key={label} className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ background: 'var(--surface2)' }}>
                <span className="text-base w-6 text-center flex-shrink-0">{icon}</span>
                <span className="text-sm" style={{ color: 'var(--text2)' }}>{label}</span>
                <span className="ml-auto text-base" style={{ color: 'var(--red)' }}>✕</span>
              </div>
            ))}
          </div>

          <p className="text-xs text-center" style={{ color: 'var(--text3)' }}>
            Je dagelijkse limiet van 5 vacatures wordt direct van kracht.
          </p>

          <div className="flex flex-col gap-2">
            <button
              onClick={onConfirm}
              disabled={loading}
              className="w-full rounded-2xl py-3 text-sm font-bold"
              style={{ background: 'var(--red)', color: '#fff', opacity: loading ? 0.6 : 1 }}
            >
              {loading ? 'Bezig…' : 'Ja, zeg op'}
            </button>
            <button
              onClick={onClose}
              disabled={loading}
              className="w-full rounded-2xl py-3 text-sm font-semibold"
              style={{ background: 'var(--surface2)', color: 'var(--text2)' }}
            >
              Annuleren
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Premium section ──────────────────────────────────────────────────────────
function PremiumSection() {
  const [isPremium,  setIsPremium]  = useState(false);
  const [provider,   setProvider]   = useState<string | null>(null);
  const [loaded,     setLoaded]     = useState(false);
  const [showModal,  setShowModal]  = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    fetch('/api/subscription/status')
      .then(r => r.json())
      .then(d => {
        setIsPremium(!!d?.is_premium);
        setProvider(d?.provider ?? null);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const cancel = async () => {
    setCancelling(true);
    try {
      if (provider === 'stripe') {
        const res = await fetch('/api/billing-portal', { method: 'POST' });
        const { url } = await res.json();
        if (url) { window.location.href = url; return; }
      } else {
        await fetch('/api/admin/set-tier', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tier: 'free' }),
        });
        setIsPremium(false);
        setShowModal(false);
      }
    } catch { /* silent */ }
    setCancelling(false);
  };

  if (!loaded || !isPremium) return null;

  return (
    <>
      {showModal && <CancelModal onConfirm={cancel} onClose={() => setShowModal(false)} loading={cancelling} />}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: EASE }}
        className="glass-card rounded-2xl px-4 py-3 flex items-center gap-3"
        style={{ border: '1px solid var(--accent-dim)' }}
      >
        <div className="flex items-center justify-center w-8 h-8 rounded-xl flex-shrink-0" style={{ background: 'var(--accent-dim)' }}>
          <Zap size={16} style={{ color: 'var(--accent)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: 'var(--text)', margin: 0 }}>Premium actief</p>
          <p className="text-xs" style={{ color: 'var(--text2)', margin: 0 }}>Onbeperkte toegang tot alle functies</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex-shrink-0 text-xs px-3 py-1.5 rounded-xl font-semibold"
          style={{ background: 'rgba(251,113,133,0.1)', color: 'var(--red)', border: '1px solid rgba(251,113,133,0.25)' }}
        >
          Opzeggen
        </button>
      </motion.div>
    </>
  );
}

function DailyScrapeToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => setEnabled(d?.daily_scrape_enabled ?? true))
      .catch(() => setEnabled(true));
  }, []);

  const toggle = async () => {
    if (enabled === null || saving) return;
    const next = !enabled;
    setEnabled(next);
    setSaving(true);
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daily_scrape_enabled: next }),
      });
    } catch {
      setEnabled(!next);
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="glass-card flex items-center gap-3 rounded-2xl px-4 py-3"
    >
      <div className="flex items-center justify-center w-8 h-8 rounded-xl flex-shrink-0" style={{ background: 'var(--accent-dim)' }}>
        <RefreshCw size={16} style={{ color: 'var(--accent)' }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: 'var(--text)', margin: 0 }}>Dagelijkse vacature scan</p>
        <p className="text-xs" style={{ color: 'var(--text2)', margin: 0 }}>
          {enabled ? 'Automatisch scrapen ingeschakeld' : 'Automatisch scrapen uitgeschakeld'}
        </p>
      </div>
      <button
        onClick={toggle}
        disabled={enabled === null || saving}
        aria-checked={enabled ?? false}
        role="switch"
        aria-label="Dagelijkse vacature scan"
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 }}
      >
        <motion.div
          animate={{ background: enabled ? 'var(--green)' : 'var(--surface3)' }}
          transition={{ duration: 0.2 }}
          style={{ width: 44, height: 26, borderRadius: 9999, position: 'relative', opacity: enabled === null ? 0.4 : 1 }}
        >
          <motion.div
            animate={{ x: enabled ? 20 : 2 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            style={{
              position: 'absolute',
              top: 3,
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: '#fff',
              boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
            }}
          />
        </motion.div>
      </button>
    </motion.div>
  );
}

function EmailSettingsButton() {
  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
    >
      <Link
        href="/settings/email"
        className="glass-card flex items-center gap-3 rounded-2xl px-4 py-3 w-full text-left"
        style={{ border: '1px solid var(--accent-dim)', cursor: 'pointer', textDecoration: 'none', display: 'flex' }}
      >
        <div className="flex items-center justify-center w-8 h-8 rounded-xl flex-shrink-0" style={{ background: 'var(--accent-dim)' }}>
          <Mail size={16} style={{ color: 'var(--accent)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: 'var(--text)', margin: 0 }}>E-mailinstellingen</p>
          <p className="text-xs" style={{ color: 'var(--text2)', margin: 0 }}>Gmail, naam en handtekening</p>
        </div>
        <ChevronRight size={16} style={{ color: 'var(--text3)', flexShrink: 0 }} />
      </Link>
    </motion.div>
  );
}

function WalkthroughButton() {
  const start = () => {
    localStorage.removeItem(WALKTHROUGH_KEY);
    window.dispatchEvent(new Event('walkthrough:open'));
  };
  return (
    <motion.button
      onClick={start}
      whileTap={{ scale: 0.97 }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="glass-card flex items-center gap-3 rounded-2xl px-4 py-3 w-full text-left"
      style={{ border: '1px solid var(--accent-dim)', cursor: 'pointer' }}
    >
      <div className="flex items-center justify-center w-8 h-8 rounded-xl flex-shrink-0" style={{ background: 'var(--accent-dim)' }}>
        <HelpCircle size={16} style={{ color: 'var(--accent)' }} />
      </div>
      <div>
        <p className="text-sm font-semibold" style={{ color: 'var(--text)', margin: 0 }}>Rondleiding hervatten</p>
        <p className="text-xs" style={{ color: 'var(--text2)', margin: 0 }}>Uitleg over alle functies van de app</p>
      </div>
    </motion.button>
  );
}

function SenderModeBadge() {
  const mode       = process.env.NEXT_PUBLIC_MAIL_MODE ?? 'direct';
  const isSelf     = mode === 'self';
  const selfAddr   = process.env.NEXT_PUBLIC_MAIL_SELF_ADDRESS ?? 'info@jordy.beer';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="glass-card flex items-center justify-between gap-3 rounded-2xl px-4 py-3"
    >
      <div className="flex flex-col gap-0.5">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text2)' }}>
          Verzendmodus
        </p>
        <p className="text-sm" style={{ color: 'var(--text)' }}>
          {isSelf
            ? <>Mails gaan naar <span style={{ color: 'var(--accent)' }}>{selfAddr}</span> voor review</>  
            : 'Direct naar werkgever'}
        </p>
      </div>
      <span
        className="flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full"
        style={{
          background: isSelf ? 'rgba(251,191,36,0.13)' : 'rgba(74,222,128,0.13)',
          color:      isSelf ? 'var(--yellow)'         : 'var(--green)',
          border:     `1px solid ${isSelf ? 'rgba(251,191,36,0.35)' : 'rgba(74,222,128,0.35)'}`,
        }}
      >
        {isSelf ? 'REVIEW' : 'DIRECT'}
      </span>
    </motion.div>
  );
}

function UserCard({
  email, avatar, supabase,
}: {
  email: string;
  avatar: string | null;
  supabase: ReturnType<typeof createBrowserClient>;
}) {
  const [loggingOut, setLoggingOut] = useState(false);

  const logout = async () => {
    setLoggingOut(true);
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="glass-card flex items-center justify-between gap-3 rounded-2xl p-4"
    >
      <div className="flex items-center gap-3 min-w-0">
        {avatar
          ? <img src={avatar} className="w-10 h-10 rounded-full flex-shrink-0" style={{ border: '2px solid var(--border-bright)' }} alt="" />
          : (
            <div
              className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-base font-bold glass"
              style={{ border: '2px solid var(--border-bright)', color: 'var(--accent)' }}
            >
              {email[0].toUpperCase()}
            </div>
          )
        }
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{email}</p>
          <p className="text-xs" style={{ color: 'var(--text2)' }}>Ingelogd</p>
        </div>
      </div>

      <motion.button
        onClick={logout}
        disabled={loggingOut}
        whileTap={{ scale: 0.93 }}
        className="glass-btn flex-shrink-0 text-xs px-3 py-1.5 rounded-xl disabled:opacity-40"
        style={{ cursor: 'pointer', color: 'var(--red)' }}
      >
        {loggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Uitloggen'}
      </motion.button>
    </motion.div>
  );
}
