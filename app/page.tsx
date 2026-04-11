"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, useSpring, useTransform, AnimatePresence } from 'framer-motion';
import Lottie from 'lottie-react';
import loaderDots from './lotties/loader-dots.json';
import { X, ArrowRight, Loader2 } from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';
import MoneyRain from '@/components/MoneyRain';

const PARTY    = String.fromCodePoint(0x1F389);
const DASH     = '\u2014';
const ELLIPSIS = '\u2026';
const WARN     = '\u26a0\ufe0f';

const DEFAULT_TAGS = ['helpdesk', 'it support', 'servicedesk', 'applicatiebeheerder'];

const NAV_TABS = [
  { key: 'home',    label: 'Home',           href: '/',                 accent: 'var(--accent)', accentBg: 'var(--accent-dim)',  accentBorder: 'var(--accent-glow)' },
  { key: 'queue',   label: 'Wachtrij',       href: '/queue?tab=queue',  accent: 'var(--accent)', accentBg: 'var(--accent-dim)',  accentBorder: 'var(--accent-glow)' },
  { key: 'saved',   label: 'Bewaard',        href: '/queue?tab=saved',  accent: 'var(--yellow)', accentBg: 'var(--yellow-dim)', accentBorder: 'rgba(245,158,11,0.3)' },
  { key: 'applied', label: 'Gesolliciteerd', href: '/queue?tab=applied', accent: 'var(--green)', accentBg: 'var(--green-dim)', accentBorder: 'var(--green-glow)' },
];

function ProgressBar({ value, loading }: { value: number; loading: boolean }) {
  const spring = useSpring(value, { stiffness: 60, damping: 20, mass: 0.8 });
  useEffect(() => { spring.set(value); }, [value, spring]);
  const width = useTransform(spring, (v) => `${v}%`);
  return (
    <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.15)', position: 'relative' }}>
      <motion.div className="absolute inset-y-0 left-0 rounded-full"
        style={{ width, background: 'rgba(255,255,255,0.9)' }} />
      {loading && (
        <motion.div className="absolute inset-y-0 left-0 rounded-full pointer-events-none"
          style={{ width, background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 50%, transparent 100%)', backgroundSize: '200% 100%' }}
          animate={{ backgroundPosition: ['200% 0', '-200% 0'] }}
          transition={{ repeat: Infinity, duration: 1.4, ease: 'linear' }} />
      )}
    </div>
  );
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
            style={{ fontSize: '3.8rem', fontWeight: 700, letterSpacing: '-0.03em', color: '#f0f2ff', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
            {ch}
          </motion.span>
        ))}
        {'tide'.split('').map((ch, i) => (
          <motion.span key={`t${i}`} variants={LETTER_VARIANTS}
            style={{ fontSize: '3.8rem', fontWeight: 700, letterSpacing: '-0.03em', color: '#818cf8', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
            {ch}
          </motion.span>
        ))}
      </motion.div>
      <motion.p
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.65, ease: EASE }}
        style={{ fontSize: '0.95rem', color: 'rgba(240,242,255,0.55)', marginTop: '0.25rem', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', fontWeight: 400 }}
      >
        Vind een job die bij je past
      </motion.p>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const [loading, setLoading]     = useState(false);
  const [status, setStatus]       = useState('');
  const [progress, setProgress]   = useState(0);
  const [isAdmin, setIsAdmin]     = useState(false);
  const [tags, setTagsRaw]        = useState<string[]>(DEFAULT_TAGS);
  const [tagInput, setTagInput]   = useState('');
  const inputRef                  = useRef<HTMLInputElement>(null);
  const tagsScrollRef             = useRef<HTMLDivElement>(null);
  const [hydrated, setHydrated]   = useState(false);
  const [newCount, setNewCount]   = useState<number | null>(null);
  const [rainState, setRainState] = useState<'idle' | 'raining' | 'draining'>('idle');
  const onDrained = useCallback(() => setRainState('idle'), []);

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    supabase.auth.getUser().then(() => {});
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => {
        setIsAdmin(!!d?.is_admin);
        const dbTags: string[] = d?.keywords ?? [];
        if (dbTags.length > 0) { setTagsRaw(dbTags); try { localStorage.setItem('ja_tags', JSON.stringify(dbTags)); } catch {} }
        else { try { const c = localStorage.getItem('ja_tags'); if (c) setTagsRaw(JSON.parse(c)); } catch {} }
      })
      .catch(() => { try { const c = localStorage.getItem('ja_tags'); if (c) setTagsRaw(JSON.parse(c)); } catch {} })
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (tagsScrollRef.current) {
      tagsScrollRef.current.scrollTop = tagsScrollRef.current.scrollHeight;
    }
  }, [tags]);

  const persistTags = useCallback(async (next: string[]) => {
    try { localStorage.setItem('ja_tags', JSON.stringify(next)); } catch {}
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
    setLoading(true); setProgress(3); setNewCount(null);
    setRainState('raining');
    const hasTags = tags.length > 0;
    setStatus(`Zoeken naar vacatures${ELLIPSIS}`);
    try {
      setStatus(`Scraping Adzuna${ELLIPSIS}`); setProgress(10);
      const query = hasTags ? `?source=adzuna&tags=${encodeURIComponent(tags.join(','))}` : '?source=adzuna';
      const res   = await fetch(`/api/scrape/stream${query}`, { method: 'POST' });
      if (!res.body) throw new Error('No stream body');
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n'); buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.type === 'log') { setProgress(p => Math.min(p + 2, 65)); }
          } catch {}
        }
      }

      setProgress(70); setStatus(`Wachtrij aanmaken${ELLIPSIS}`);
      const creep = setInterval(() => setProgress(p => p < 92 ? p + 1 : p), 800);

      const pr  = await fetch('/api/process', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keywords: tags }) });
      clearInterval(creep);
      const pd  = await pr.json();
      if (!pr.ok) {
        const errMsg = pd.error || pd.message || `HTTP ${pr.status}`;
        setProgress(0); setStatus(`${WARN} ${errMsg}`);
      } else if (pd.success) {
        setProgress(100); setNewCount(pd.count || 0);
        setStatus(`${pd.count || 0} nieuwe vacatures ${DASH} bekijk ze snel!`);
      } else {
        setProgress(100); setStatus(pd.message || 'Niets nieuws gevonden.');
      }
    } catch (err: unknown) { setProgress(0); setStatus(`Error: ${(err as Error).message}`); }
    setLoading(false); setRainState('draining');
  };

  if (!hydrated) return (
    <main className="page-shell flex flex-col items-center justify-center" style={{ minHeight: '60dvh' }}>
      <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent)' }} />
    </main>
  );

  return (
    <main className="page-shell flex flex-col" style={{ minHeight: 'calc(100dvh - var(--navbar-h) - env(safe-area-inset-top, 0px))', gap: 0 }}>
      {rainState !== 'idle' && <MoneyRain active={rainState === 'raining'} draining={rainState === 'draining'} onDrained={onDrained} />}

      {/* Nav tab bar */}
      <div
        className="flex items-center rounded-2xl p-1 gap-1 relative mb-8"
        style={{ background: 'var(--surface2)' }}
        role="tablist" aria-label="Navigatie"
      >
        {NAV_TABS.map(tab => {
          const isActive = tab.key === 'home';
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => { if (tab.key !== 'home') router.push(tab.href); }}
              className="relative flex-1 flex items-center justify-center py-2 rounded-xl text-xs font-semibold"
              style={{ color: isActive ? tab.accent : 'var(--text2)', isolation: 'isolate' }}
            >
              {isActive && (
                <motion.span
                  layoutId="home-tab-pill"
                  className="absolute inset-0 rounded-xl"
                  style={{
                    background: tab.accentBg,
                    border: `1px solid ${tab.accentBorder}`,
                    zIndex: 0,
                    pointerEvents: 'none',
                  }}
                  transition={{ type: 'spring' as const, damping: 26, stiffness: 380 }}
                />
              )}
              <span className="relative" style={{ zIndex: 1 }}>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Wordmark + subtitle */}
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}
        className="flex items-start justify-between pb-8">
        <JobtideWordmark />
        {isAdmin && (
          <Link href="/admin" className="flex-shrink-0 text-xl leading-none mt-3" aria-label="Admin">
            🔑
          </Link>
        )}
      </motion.div>

      {/* Tags card */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, delay: 0.10 }}
        className="glass-card rounded-2xl flex flex-col cursor-text"
        style={{ flex: '1 1 0', minHeight: 0 }}
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
                  className="flex items-center justify-center w-6 h-6 rounded-full opacity-60 hover:opacity-100 active:scale-90 transition-[opacity,transform] duration-100"
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

      {/* Button + result */}
      <div className="flex flex-col gap-4 pt-8 pb-2">
        <motion.button
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, delay: 0.16 }}
          onClick={runPipeline} disabled={loading}
          data-walkthrough="zoek-knop"
          aria-busy={loading}
          className="glass-btn-accent w-full rounded-2xl active:scale-95 transition-transform duration-100 disabled:opacity-60 overflow-hidden"
          style={{ padding: 0 }}>
          <div className="flex flex-col gap-2 px-5 py-4">
            <div className="flex items-center justify-between">
              <AnimatePresence mode="wait">
                {loading ? (
                  <motion.span key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="flex items-center gap-2 text-sm font-medium" style={{ color: 'rgba(255,255,255,0.9)' }}>
                    <Lottie animationData={loaderDots} loop autoplay style={{ width: 28, height: 18, filter: 'brightness(10)' }} />
                    <span className="truncate max-w-[200px]">{status || `Bezig${ELLIPSIS}`}</span>
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
                  className="tabular-nums text-sm font-semibold flex-shrink-0"
                  style={{ color: 'rgba(255,255,255,0.9)' }}>
                  {Math.round(progress)}%
                </motion.span>
              )}
            </div>
            {loading && <ProgressBar value={progress} loading={loading} />}
          </div>
        </motion.button>

        <AnimatePresence>
          {!loading && newCount !== null && newCount > 0 && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}>
              <Link href="/queue"
                className="badge-accent flex items-center justify-between w-full px-4 py-3 rounded-xl text-sm font-semibold"
                style={{ color: 'var(--accent)' }}>
                <span>{PARTY} {newCount} nieuwe vacatures klaar om te reviewen</span>
                <ArrowRight className="w-4 h-4 flex-shrink-0" />
              </Link>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Schermlezer live regio voor statusmeldingen */}
        <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {status}
        </div>
      </div>
    </main>
  );
}
