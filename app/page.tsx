"use client";

import Link from 'next/link';
import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, useSpring, useTransform, AnimatePresence } from 'framer-motion';
import Lottie from 'lottie-react';
import loaderDots from './lotties/loader-dots.json';
import { X, ArrowRight } from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';
import MoneyRain from '@/components/MoneyRain';
import Toast from '@/components/Toast';
import { useToast } from '@/hooks/useToast';

const PARTY    = String.fromCodePoint(0x1F389);
const ELLIPSIS = '\u2026';
const WARN     = '\u26a0\ufe0f';

const DEFAULT_TAGS = ['helpdesk', 'it support', 'servicedesk', 'applicatiebeheerder'];

const STEPS: { pct: number; label: string; delay: number }[] = [
  { pct: 8,  label: 'Zoeken naar vacatures\u2026',        delay: 0     },
  { pct: 18, label: 'Nieuwe resultaten ophalen\u2026',     delay: 3500  },
  { pct: 30, label: 'Dubbele vermeldingen filteren\u2026', delay: 9000  },
  { pct: 42, label: 'Beschrijvingen analyseren\u2026',     delay: 16000 },
  { pct: 54, label: 'Jouw profiel vergelijken\u2026',      delay: 24000 },
  { pct: 64, label: 'Scores berekenen\u2026',              delay: 33000 },
  { pct: 72, label: 'Resultaten rangschikken\u2026',       delay: 44000 },
  { pct: 80, label: 'Overzicht opmaken\u2026',             delay: 56000 },
  { pct: 88, label: 'Laatste check\u2026',                 delay: 70000 },
  { pct: 93, label: 'Bijna klaar\u2026',                   delay: 82000 },
];

// ─── Typewriter step label ────────────────────────────────────────────────────
function TypewriterLabel({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState('');
  useEffect(() => {
    setDisplayed('');
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, 28);
    return () => clearInterval(id);
  }, [text]);
  return <span>{displayed}</span>;
}

// ─── Spark particle ──────────────────────────────────────────────────────────
function Spark({ x }: { x: number }) {
  const angle = (Math.random() - 0.5) * 160 - 90; // mostly upward spread
  const dist  = 12 + Math.random() * 18;
  const dx    = Math.sin((angle * Math.PI) / 180) * dist;
  const dy    = -Math.abs(Math.cos((angle * Math.PI) / 180)) * dist;
  const size  = 2 + Math.random() * 2;
  return (
    <motion.div
      style={{
        position: 'absolute',
        top: '50%',
        left: `${x}%`,
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.9)',
        boxShadow: '0 0 4px 1px rgba(165,180,252,0.8)',
        pointerEvents: 'none',
        translateX: '-50%',
        translateY: '-50%',
      }}
      animate={{ x: dx, y: dy, opacity: [1, 0], scale: [1, 0.3] }}
      transition={{ duration: 0.55 + Math.random() * 0.3, ease: 'easeOut' }}
    />
  );
}

// ─── Progress bar with spark trail ───────────────────────────────────────────
function ProgressBar({ value, loading }: { value: number; loading: boolean }) {
  const spring = useSpring(value, { stiffness: 38, damping: 18, mass: 1 });
  useEffect(() => { spring.set(value); }, [value, spring]);
  const width = useTransform(spring, (v) => `${v}%`);

  const [sparks, setSparks] = useState<{ id: number; x: number }[]>([]);
  const prevPct = useRef(value);

  useEffect(() => {
    if (!loading) return;
    const unsub = spring.on('change', (v) => {
      if (v - prevPct.current > 1.5) {
        prevPct.current = v;
        const newSparks = Array.from({ length: 4 }, (_, i) => ({ id: Date.now() + i, x: v }));
        setSparks(s => [...s.slice(-10), ...newSparks]);
        setTimeout(() => setSparks(s => s.filter(p => !newSparks.find(n => n.id === p.id))), 900);
      }
    });
    return () => unsub();
  }, [spring, loading]);

  return (
    <div
      className="w-full rounded-full overflow-visible"
      style={{ height: 3, background: 'rgba(255,255,255,0.18)', position: 'relative' }}
    >
      {/* Filled track */}
      <motion.div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ width, background: 'rgba(255,255,255,0.88)' }}
      />

      {/* Comet streak */}
      {loading && (
        <motion.div
          className="absolute inset-y-0 rounded-full pointer-events-none"
          style={{
            width: '22%',
            background:
              'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.55) 60%, rgba(255,255,255,0.9) 100%)',
            filter: 'blur(1px)',
          }}
          animate={{ left: ['-22%', '100%'] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: [0.45, 0, 0.55, 1], repeatDelay: 0.6 }}
        />
      )}

      {/* Spark particles at progress tip */}
      {sparks.map(s => <Spark key={s.id} x={s.x} />)}
    </div>
  );
}

// ─── Animated count-up ────────────────────────────────────────────────────────
function CountUp({ target }: { target: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let frame = 0;
    const total = 28;
    const id = setInterval(() => {
      frame++;
      setDisplay(Math.round((frame / total) * target));
      if (frame >= total) clearInterval(id);
    }, 40);
    return () => clearInterval(id);
  }, [target]);
  return <>{display}</>;
}

const EASE = [0.16, 1, 0.3, 1] as const;

const WORDMARK_VARIANTS = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.045, delayChildren: 0.15 } },
};
const LETTER_VARIANTS = {
  hidden:  { opacity: 0, y: 10, filter: 'blur(4px)' },
  visible: { opacity: 1, y: 0,  filter: 'blur(0px)', transition: { duration: 0.35, ease: EASE } },
};

function JobtideWordmark() {
  return (
    <div>
      <motion.div
        variants={WORDMARK_VARIANTS}
        initial="hidden"
        animate="visible"
        style={{ display: 'flex', alignItems: 'baseline', gap: 0, lineHeight: 1 }}
      >
        {'job'.split('').map((ch, i) => (
          <motion.span key={`j${i}`} variants={LETTER_VARIANTS}
            style={{ fontSize: '3.8rem', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text)', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
            {ch}
          </motion.span>
        ))}
        {'tide'.split('').map((ch, i) => (
          <motion.span key={`t${i}`} variants={LETTER_VARIANTS}
            style={{ fontSize: '3.8rem', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--accent)', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
            {ch}
          </motion.span>
        ))}
      </motion.div>
      <motion.p
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.65, ease: EASE }}
        style={{ fontSize: '0.95rem', color: 'var(--text3)', marginTop: '0.25rem', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', fontWeight: 400 }}
      >
        Vind een job die bij je past
      </motion.p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Home() {
  const [loading, setLoading]         = useState(false);
  const [status, setStatus]           = useState('');
  const [progress, setProgress]       = useState(0);
  const [isAdmin, setIsAdmin]         = useState(false);
  const [isPremium, setIsPremium]     = useState(false);
  const [tags, setTagsRaw]            = useState<string[]>(DEFAULT_TAGS);
  const [tagInput, setTagInput]       = useState('');
  const inputRef                      = useRef<HTMLInputElement>(null);
  const tagsScrollRef                 = useRef<HTMLDivElement>(null);
  const [hydrated, setHydrated]       = useState(false);
  const [rainState, setRainState]     = useState<'idle' | 'raining' | 'draining'>('idle');
  const [burst, setBurst]             = useState(false);
  const [foundCount, setFoundCount]   = useState<number | null>(null);
  const [ambientPulse, setAmbientPulse] = useState(false);
  const onDrained = useCallback(() => setRainState('idle'), []);

  const stepTimersRef   = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollBaselineRef = useRef<number>(0);
  const pollAttemptsRef = useRef<number>(0);

  const { toast, show: showToast, dismiss: dismissToast } = useToast(6000);

  const clearStepTimers = () => {
    stepTimersRef.current.forEach(clearTimeout);
    stepTimersRef.current = [];
  };

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
  }, []);

  const finishRun = useCallback((newCount: number | null) => {
    clearStepTimers();
    stopPolling();
    setProgress(100);
    setStatus('');
    setAmbientPulse(false);

    setTimeout(() => {
      // Completion burst flash
      setBurst(true);
      setTimeout(() => setBurst(false), 700);

      setLoading(false);
      setRainState('draining');

      if (newCount !== null && newCount > 0) {
        setFoundCount(newCount);
        showToast(`${PARTY} ${newCount} nieuwe vacature${newCount !== 1 ? 's' : ''} klaar voor review`, 'success');
      } else {
        setFoundCount(null);
        showToast('Klaar! Bekijk je wachtrij voor de laatste resultaten.', 'info');
      }
    }, 420);
  }, [stopPolling, showToast]);

  const startPolling = useCallback((baseline: number) => {
    pollAttemptsRef.current = 0;
    pollIntervalRef.current = setInterval(async () => {
      pollAttemptsRef.current++;
      try {
        const r = await fetch('/api/notifications');
        const d = await r.json() as { unread?: number; notifications?: { title: string; body: string }[] };
        const unread = d.unread ?? 0;
        if (unread > baseline) {
          const n = (d.notifications ?? []).find(x => x.title?.includes('vacature'));
          const match = n?.body?.match(/(\d+)/);
          const found = match ? parseInt(match[1], 10) : null;
          finishRun(found);
          return;
        }
      } catch {}
      if (pollAttemptsRef.current >= 20) finishRun(null);
    }, 15_000);
  }, [finishRun]);

  useEffect(() => () => {
    clearStepTimers();
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
  }, []);

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    supabase.auth.getUser().then(() => {});
    Promise.all([
      fetch('/api/settings').then(r => r.json()),
      fetch('/api/subscription/status').then(r => r.json()),
    ])
      .then(([d, sub]) => {
        setIsAdmin(!!d?.is_admin);
        setIsPremium(!!sub?.is_premium);
        const dbTags: string[] = d?.keywords ?? [];
        if (dbTags.length > 0) { setTagsRaw(dbTags); }
      })
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (tagsScrollRef.current) {
      tagsScrollRef.current.scrollTop = tagsScrollRef.current.scrollHeight;
    }
  }, [tags]);

  const persistTags = useCallback(async (next: string[]) => {
    try { await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keywords: next }) }); } catch {}
  }, []);

  const setTags = (fn: (prev: string[]) => string[]) => {
    setTagsRaw(prev => { const next = fn(prev); persistTags(next); return next; });
  };

  const addTag = (raw: string) => {
    const val = raw.trim();
    if (!val || tags.includes(val)) { setTagInput(''); return; }
    setTags(prev => [...prev, val]); setTagInput('');
  };

  const removeTag = (tag: string) => setTags(prev => prev.filter(t => t !== tag));

  const onTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput); }
    if (e.key === 'Backspace' && tagInput === '' && tags.length > 0) setTags(prev => prev.slice(0, -1));
  };

  const runPipeline = async () => {
    if (loading) return;
    clearStepTimers();
    stopPolling();
    setFoundCount(null);

    setLoading(true);
    setProgress(0);
    setAmbientPulse(true);
    setRainState('raining');

    const timers = STEPS.map(({ pct, label, delay }) =>
      setTimeout(() => { setProgress(pct); setStatus(label); }, delay)
    );
    stepTimersRef.current = timers;
    setStatus(STEPS[0].label);
    setProgress(STEPS[0].pct);

    let baseline = 0;
    try {
      const nr = await fetch('/api/notifications');
      const nd = await nr.json() as { unread?: number };
      baseline = nd.unread ?? 0;
    } catch {}
    pollBaselineRef.current = baseline;

    try {
      const res = await fetch('/api/pipeline/trigger', { method: 'POST' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        clearStepTimers();
        setProgress(0);
        setStatus('');
        setLoading(false);
        setAmbientPulse(false);
        setRainState('draining');
        showToast(`${WARN} ${(d as { error?: string }).error ?? `Fout (${res.status})`}`, 'error');
        return;
      }
    } catch (err: unknown) {
      clearStepTimers();
      setProgress(0);
      setStatus('');
      setLoading(false);
      setAmbientPulse(false);
      setRainState('draining');
      showToast(`${WARN} ${(err as Error).message}`, 'error');
      return;
    }

    startPolling(baseline);
  };

  if (!hydrated) return (
    <main className="page-shell flex flex-col" style={{ minHeight: 'calc(100dvh - var(--navbar-h) - env(safe-area-inset-top, 0px))', gap: 0 }}>
      <div className="flex flex-col gap-1.5 pb-8">
        <div className="animate-pulse rounded-lg" style={{ width: '7rem', height: '3.4rem', background: 'var(--surface2)' }} />
        <div className="animate-pulse rounded" style={{ width: '10rem', height: '0.9rem', background: 'var(--surface2)', opacity: 0.6 }} />
      </div>
      <div className="glass-card rounded-2xl animate-pulse" style={{ flex: '1 1 0', minHeight: 0 }} />
      <div className="pt-8 pb-2">
        <div className="animate-pulse rounded-2xl" style={{ width: '100%', height: '3.5rem', background: 'var(--surface2)' }} />
      </div>
    </main>
  );

  return (
    <main className="page-shell flex flex-col" style={{ minHeight: 'calc(100dvh - var(--navbar-h) - env(safe-area-inset-top, 0px))', gap: 0 }}>

      {/* ── Ambient pulse overlay while loading ── */}
      <AnimatePresence>
        {ambientPulse && (
          <motion.div
            key="ambient"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.6, 0.3, 0.6, 0.3] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'fixed',
              inset: 0,
              pointerEvents: 'none',
              zIndex: 0,
              background:
                'radial-gradient(ellipse 70% 50% at 50% 90%, rgba(129,140,248,0.18) 0%, transparent 70%)',
            }}
          />
        )}
      </AnimatePresence>

      {rainState !== 'idle' && <MoneyRain active={rainState === 'raining'} draining={rainState === 'draining'} onDrained={onDrained} />}

      {/* Wordmark */}
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}
        className="flex items-start justify-between pb-8" style={{ position: 'relative', zIndex: 1 }}>
        <JobtideWordmark />
        <AnimatePresence>
          {isPremium && hydrated && (
            <motion.div
              key="premium-badge"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.35, ease: EASE }}
              className="relative mt-2.5 flex-shrink-0 overflow-hidden rounded-full px-2.5 py-1 flex items-center gap-1"
              style={{ background: 'linear-gradient(135deg, var(--accent-dim), rgba(167,139,250,0.18))' }}
            >
              <motion.span
                className="absolute inset-0 rounded-full"
                style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.07) 50%, transparent 100%)', backgroundSize: '200% 100%' }}
                animate={{ backgroundPosition: ['200% 0%', '-200% 0%'] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
              />
              <span style={{ fontSize: 11, color: 'var(--accent-bright)', fontWeight: 700, letterSpacing: '0.06em', position: 'relative' }}>⚡ PREMIUM</span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Tags card */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, delay: 0.10 }}
        className="glass-card rounded-2xl flex flex-col cursor-text"
        style={{ flex: '1 1 0', minHeight: 0, position: 'relative', zIndex: 1 }}
        onClick={() => inputRef.current?.focus()}>
        <p className="text-xs font-semibold uppercase tracking-widest px-4 pt-4 pb-2 flex-shrink-0" style={{ color: 'var(--text2)' }}>Zoekwoorden</p>
        <div
          ref={tagsScrollRef}
          className="flex-1 min-h-0 overflow-y-auto px-4 pb-3"
          style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="flex flex-wrap gap-2">
            {tags.map(tag => (
              <span key={tag} className="badge-accent flex items-center gap-1 text-sm font-medium pl-3 pr-1.5 py-1 rounded-full">
                {tag}
                <button
                  onClick={e => { e.stopPropagation(); removeTag(tag); }}
                  aria-label={`Verwijder ${tag}`}
                  className="flex items-center justify-center w-8 h-8 -mr-1 rounded-full opacity-60 hover:opacity-100 active:scale-90 transition-[opacity,transform] duration-100"
                  style={{ color: 'var(--accent)' }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
        </div>
        <div className="px-4 pb-4 pt-1 flex-shrink-0 border-t" style={{ borderColor: 'var(--divider)' }}>
          <input ref={inputRef} type="text" value={tagInput} onChange={e => setTagInput(e.target.value)}
            onKeyDown={onTagKeyDown} onBlur={() => { if (tagInput.trim()) addTag(tagInput); }}
            placeholder={`Geef een functie in${ELLIPSIS}`} className="bg-transparent text-sm outline-none w-full pt-2"
            style={{ color: 'var(--text)' }} />
        </div>
      </motion.div>

      {/* ── CTA button ── */}
      <div className="flex flex-col gap-4 pt-8 pb-2" style={{ position: 'relative', zIndex: 1 }}>
        <motion.button
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, delay: 0.16 }}
          onClick={runPipeline} disabled={loading}
          data-walkthrough="zoek-knop"
          aria-busy={loading}
          className="glass-btn-accent w-full rounded-2xl active:scale-95 transition-transform duration-100 disabled:opacity-80 overflow-hidden"
          style={{
            padding: 0,
            position: 'relative',
            // Completion burst: flash green then fade back
            boxShadow: burst
              ? '0 0 0 3px rgba(52,211,153,0.6), 0 0 32px 8px rgba(52,211,153,0.35)'
              : ambientPulse
              ? '0 0 24px 4px rgba(129,140,248,0.22)'
              : undefined,
            transition: 'box-shadow 0.35s ease',
          }}
        >
          {/* Completion burst ripple */}
          <AnimatePresence>
            {burst && (
              <motion.div
                key="burst"
                initial={{ scale: 0.6, opacity: 0.7 }}
                animate={{ scale: 2.2, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.65, ease: 'easeOut' }}
                style={{
                  position: 'absolute', inset: 0,
                  borderRadius: 'inherit',
                  background: 'radial-gradient(ellipse at center, rgba(52,211,153,0.45) 0%, transparent 70%)',
                  pointerEvents: 'none',
                }}
              />
            )}
          </AnimatePresence>

          <div className="flex flex-col gap-2.5 px-5 py-4">
            <div className="flex items-center justify-between">
              <AnimatePresence mode="wait">
                {loading ? (
                  <motion.span key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="flex items-center gap-2 text-sm font-medium" style={{ color: 'rgba(255,255,255,0.9)' }}>
                    <Lottie animationData={loaderDots} loop autoplay style={{ width: 28, height: 18, filter: 'brightness(10)' }} />
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={status}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.18, ease: EASE }}
                        className="min-w-0 flex-1"
                      >
                        <TypewriterLabel text={status} />
                      </motion.span>
                    </AnimatePresence>
                  </motion.span>
                ) : (
                  <motion.span key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="text-base font-semibold">
                    Zoeken
                  </motion.span>
                )}
              </AnimatePresence>

              {loading && (
                <motion.span
                  key={Math.round(progress / 5)}
                  initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className="tabular-nums text-sm font-semibold flex-shrink-0 ml-3"
                  style={{ color: 'rgba(255,255,255,0.75)' }}>
                  {Math.round(progress)}%
                </motion.span>
              )}
            </div>

            {loading && <ProgressBar value={progress} loading={loading} />}

            {/* ── Slot-counter reveal on completion ── */}
            <AnimatePresence>
              {!loading && foundCount !== null && (
                <motion.div
                  key="counter"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, ease: EASE }}
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: 'var(--green)',
                    letterSpacing: '0.02em',
                  }}
                >
                  <CountUp target={foundCount} /> vacature{foundCount !== 1 ? 's' : ''} gevonden
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.button>

        <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">{status}</div>
      </div>

      {/* Toast */}
      <Toast
        toast={toast}
        onDismiss={dismissToast}
      />

      {/* Clickable overlay on success toast */}
      <AnimatePresence>
        {toast && toast.variant === 'success' && (
          <Link
            href="/queue"
            aria-label="Ga naar wachtrij"
            style={{
              position: 'fixed',
              bottom: 'calc(var(--navbar-h) + 12px)',
              left: '50%',
              width: 'min(calc(100vw - 32px), 380px)',
              height: 62,
              transform: 'translateX(-50%)',
              zIndex: 'var(--z-pwa-toast)',
              borderRadius: '1.125rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              paddingRight: '3rem',
              color: 'var(--accent)',
              gap: '0.25rem',
              pointerEvents: 'auto',
            }}
          >
            <ArrowRight size={15} strokeWidth={2.5} />
          </Link>
        )}
      </AnimatePresence>
    </main>
  );
}
