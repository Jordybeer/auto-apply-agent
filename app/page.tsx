"use client";

import Link from 'next/link';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, useSpring, useTransform, AnimatePresence } from 'framer-motion';
import Lottie from 'lottie-react';
import loaderDots from './lotties/loader-dots.json';
import { ChevronDown, X, Copy, Check, ArrowRight } from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';
import MoneyRain from '@/components/MoneyRain';

const WAVE     = String.fromCodePoint(0x1F44B);
const PARTY    = String.fromCodePoint(0x1F389);
const ARROW    = '\u2192';
const DASH     = '\u2014';
const ELLIPSIS = '\u2026';
const CHECK    = '\u2713';
const CROSS    = '\u2717';
const WARN     = '\u26a0\ufe0f';

const prettyMs = (ms?: number) => {
  if (ms === undefined) return '';
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
};

const DEFAULT_TAGS = ['helpdesk', 'it support', 'servicedesk', 'applicatiebeheerder'];

type LogLevel = 'success' | 'error' | 'warn' | 'info' | 'meta';
interface LogEntry { ts: string; level: LogLevel; message: string; }

function classifyLog(raw: string): LogLevel {
  const t = raw.toLowerCase();
  if (raw.startsWith('✓') || (t.includes('inserted') && !t.includes('0 new')) || t.includes('queued=')) return 'success';
  if (raw.startsWith('✗') || t.includes('error') || t.includes('failed') || t.includes('stream ended without') || t.includes('unknown error')) return 'error';
  if (t.includes('rate limit') || t.includes('groq_skipped') || t.includes('empty html') || t.includes('401') || t.includes('429')) return 'warn';
  if (raw.startsWith('→') || t.startsWith('tags:') || t.startsWith('📊') || raw.startsWith('▶')) return 'meta';
  return 'info';
}

const LEVEL_STYLES: Record<LogLevel, { badge: string; badgeBg: string; msg: string }> = {
  success: { badge: 'var(--green)',  badgeBg: 'var(--green-dim)',        msg: 'var(--green)'  },
  error:   { badge: 'var(--red)',    badgeBg: 'var(--red-dim)',           msg: 'var(--red)'    },
  warn:    { badge: 'var(--yellow)', badgeBg: 'var(--yellow-dim)',        msg: 'var(--yellow)' },
  info:    { badge: 'var(--text3)',  badgeBg: 'rgba(136,136,144,0.08)',   msg: 'var(--text2)'  },
  meta:    { badge: 'var(--text4)',  badgeBg: 'transparent',             msg: 'var(--text3)'  },
};
const LEVEL_LABEL: Record<LogLevel, string> = { success: 'OK', error: 'ERR', warn: 'LET', info: 'LOG', meta: '···' };

function LogLine({ entry }: { entry: LogEntry }) {
  const s = LEVEL_STYLES[entry.level];
  return (
    <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.16 }}
      className="flex items-start gap-2 leading-snug py-0.5">
      <span className="flex-shrink-0 tabular-nums text-[10px] pt-px" style={{ color: 'var(--text2)' }}>{entry.ts}</span>
      <span className="flex-shrink-0 font-bold rounded px-1 text-[9px] tracking-[0.06em] pt-px pb-px"
        style={{ color: s.badge, background: s.badgeBg, border: `1px solid ${s.badge}44` }}>
        {LEVEL_LABEL[entry.level]}
      </span>
      <span className="text-[11px] break-all" style={{ color: s.msg }}>{entry.message}</span>
    </motion.div>
  );
}

function ProgressBar({ value, loading }: { value: number; loading: boolean }) {
  const spring = useSpring(value, { stiffness: 60, damping: 20, mass: 0.8 });
  useEffect(() => { spring.set(value); }, [value, spring]);
  const width = useTransform(spring, (v) => `${v}%`);
  return (
    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface2)', position: 'relative' }}>
      <motion.div className="absolute inset-y-0 left-0 rounded-full"
        style={{ width, background: 'linear-gradient(90deg, var(--accent), var(--accent-bright))' }} />
      {loading && (
        <motion.div className="absolute inset-y-0 left-0 rounded-full pointer-events-none"
          style={{ width, background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.22) 50%, transparent 100%)', backgroundSize: '200% 100%' }}
          animate={{ backgroundPosition: ['200% 0', '-200% 0'] }}
          transition={{ repeat: Infinity, duration: 1.4, ease: 'linear' }} />
      )}
    </div>
  );
}

const NAV_PILL_TABS = [
  { key: 'home',    label: 'Home',           accent: '#6366f1', accentBg: 'rgba(99,102,241,0.1)',  accentBorder: 'rgba(99,102,241,0.25)', href: null },
  { key: 'queue',   label: 'Wachtrij',       accent: '#6366f1', accentBg: 'rgba(99,102,241,0.15)', accentBorder: 'rgba(99,102,241,0.3)',  href: '/queue' },
  { key: 'saved',   label: 'Bewaard',        accent: '#f59e0b', accentBg: 'rgba(245,158,11,0.15)', accentBorder: 'rgba(245,158,11,0.3)',  href: '/queue?tab=saved' },
  { key: 'applied', label: 'Gesolliciteerd', accent: '#22c55e', accentBg: 'rgba(34,197,94,0.15)',  accentBorder: 'rgba(34,197,94,0.3)',   href: '/queue?tab=applied' },
];

function HomePill() {
  const router = useRouter();
  return (
    <div
      className="flex items-center rounded-2xl p-1 gap-1 relative"
      style={{ background: 'var(--surface2)' }}
      role="tablist"
      aria-label="Navigatie"
    >
      {NAV_PILL_TABS.map(tab => {
        const isActive = tab.key === 'home';
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => tab.href ? router.push(tab.href) : undefined}
            className="relative flex-1 flex items-center justify-center py-2 rounded-xl text-xs font-semibold"
            style={{ color: isActive ? tab.accent : 'var(--text2)', isolation: 'isolate' }}
          >
            {isActive && (
              <motion.span
                layoutId="tab-pill"
                className="absolute inset-0 rounded-xl"
                style={{ background: tab.accentBg, border: `1px solid ${tab.accentBorder}`, zIndex: 0, pointerEvents: 'none' }}
                transition={{ type: 'spring' as const, damping: 26, stiffness: 380 }}
              />
            )}
            <span className="relative" style={{ zIndex: 1 }}>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ── Jobtide animated wordmark ─────────────────────────────────────── */
const WORDMARK_VARIANTS = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.045, delayChildren: 0.15 } },
};
const LETTER_VARIANTS = {
  hidden:  { opacity: 0, y: 10, filter: 'blur(4px)' },
  visible: { opacity: 1, y: 0,  filter: 'blur(0px)', transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const } },
};

function JobtideWordmark() {
  return (
    <motion.div
      variants={WORDMARK_VARIANTS}
      initial="hidden"
      animate="visible"
      style={{ display: 'flex', alignItems: 'baseline', gap: 0, lineHeight: 1 }}
    >
      {'job'.split('').map((ch, i) => (
        <motion.span key={`j${i}`} variants={LETTER_VARIANTS}
          style={{ fontSize: '3.3rem', fontWeight: 700, letterSpacing: '-0.03em', color: '#f0f2ff', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
          {ch}
        </motion.span>
      ))}
      {'tide'.split('').map((ch, i) => (
        <motion.span key={`t${i}`} variants={LETTER_VARIANTS}
          style={{ fontSize: '3.3rem', fontWeight: 700, letterSpacing: '-0.03em', color: '#818cf8', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
          {ch}
        </motion.span>
      ))}
    </motion.div>
  );
}

export default function Home() {
  const [loading, setLoading]     = useState(false);
  const [status, setStatus]       = useState('');
  const [progress, setProgress]   = useState(0);
  const [showLog, setShowLog]     = useState(false);
  const [runLog, setRunLog]       = useState<LogEntry[]>([]);
  const [copied, setCopied]       = useState(false);
  const [username, setUsername]   = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isAdmin, setIsAdmin]     = useState(false);
  const logEndRef                 = useRef<HTMLDivElement>(null);
  const [tags, setTagsRaw]        = useState<string[]>(DEFAULT_TAGS);
  const [tagInput, setTagInput]   = useState('');
  const inputRef                  = useRef<HTMLInputElement>(null);
  const [hydrated, setHydrated]   = useState(false);
  const [newCount, setNewCount]   = useState<number | null>(null);
  const [rainState, setRainState] = useState<'idle' | 'raining' | 'draining'>('idle');
  const onDrained = useCallback(() => setRainState('idle'), []);

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    supabase.auth.getUser().then(({ data }) => {
      const u = data?.user;
      setUsername(u?.user_metadata?.full_name || u?.user_metadata?.name || u?.email?.split('@')[0] || null);
      setAvatarUrl(u?.user_metadata?.avatar_url || u?.user_metadata?.picture || null);
    });
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
    if (showLog) logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [runLog, showLog]);

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

  const log = (message: string) => {
    const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setRunLog(prev => [...prev, { ts, level: classifyLog(message), message }]);
  };

  const copyLogs = () => {
    const text = runLog.map(e => `${e.ts}  [${e.level.toUpperCase()}]  ${e.message}`).join('\n');
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const runPipeline = async () => {
    setRunLog([]); setCopied(false); setShowLog(true); setLoading(true); setProgress(3); setNewCount(null);
    setRainState('raining');
    const hasTags = tags.length > 0;
    setStatus(`Zoeken naar vacatures${ELLIPSIS}`);
    log(`Tags: ${hasTags ? tags.join(', ') : '(standaard)'}`);
    try {
      setStatus(`Scraping Adzuna${ELLIPSIS}`); setProgress(10);
      const t0    = performance.now();
      const query = hasTags ? `?source=adzuna&tags=${encodeURIComponent(tags.join(','))}` : '?source=adzuna';
      const res   = await fetch(`/api/scrape/stream${query}`, { method: 'POST' });
      if (!res.body) throw new Error('No stream body');
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = ''; let scrapeDone = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n'); buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.type === 'log')        { log(event.message); setProgress(p => Math.min(p + 2, 65)); }
            else if (event.type === 'done')  { const ms = Math.round(performance.now() - t0); log(`${CHECK} adzuna inserted=${event.count} found=${event.total_found} (${prettyMs(ms)})`); scrapeDone = true; }
            else if (event.type === 'error') { const ms = Math.round(performance.now() - t0); log(`${CROSS} adzuna: ${event.message} (${prettyMs(ms)})`); scrapeDone = true; }
          } catch {}
        }
      }
      if (!scrapeDone) log(`${CROSS} adzuna: stream ended without result`);

      setProgress(70); setStatus(`Wachtrij aanmaken${ELLIPSIS}`);
      log(`${ARROW} wachtrij aanmaken \u2014 vacatures scoren en brieven klaarzetten\u2026`);
      const creep = setInterval(() => setProgress(p => p < 92 ? p + 1 : p), 800);

      const p0  = performance.now();
      const pr  = await fetch('/api/process', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keywords: tags }) });
      const pMs = Math.round(performance.now() - p0);
      clearInterval(creep);
      const pd  = await pr.json();
      if (!pr.ok) {
        const errMsg = pd.error || pd.message || `HTTP ${pr.status}`;
        setProgress(0); setStatus(`${WARN} ${errMsg}`); log(`${CROSS} process: ${errMsg}`);
      } else if (pd.success) {
        setProgress(100); setNewCount(pd.count || 0);
        setStatus(`${pd.count || 0} nieuwe vacatures ${DASH} bekijk ze snel!`);
        log(`${CHECK} wachtrij: ${pd.count || 0} nieuw${pd.failed ? `, ${pd.failed} mislukt` : ''} (${prettyMs(pMs)})`);
      } else {
        setProgress(100); setStatus(pd.message || 'Niets nieuws gevonden.');
        log(`${CHECK} wachtrij: ${pd.message || 'niets nieuw'} (${prettyMs(pMs)})`);
      }
    } catch (err: unknown) { setProgress(0); setStatus(`Error: ${(err as Error).message}`); log(`ERROR: ${(err as Error).message}`); }
    setLoading(false); setRainState('draining');
  };

  if (!hydrated) return null;

  return (
    <main className="page-shell flex flex-col gap-5">
      {rainState !== 'idle' && <MoneyRain active={rainState === 'raining'} draining={rainState === 'draining'} onDrained={onDrained} />}

      <div className="flex flex-col gap-5">

        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
          <HomePill />
        </motion.div>

        {/* Header row: [jobtide wordmark left] [flex-1: greeting + avatar right] [🔑] */}
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, delay: 0.05 }}
          className="flex items-center gap-3">
          <JobtideWordmark />
          <div className="flex-1 flex items-center justify-end gap-2">
            <h1 className="text-base font-semibold tracking-tight leading-none flex-shrink-0" style={{ color: 'var(--text)' }}>
              {username ? `Hey, ${username}` : WAVE}
            </h1>
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-9 h-9 rounded-full flex-shrink-0"
                style={{ border: '2px solid var(--border)' }} />
            ) : (
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-base font-bold glass flex-shrink-0"
                style={{ color: 'var(--accent)' }}>
                {username?.[0]?.toUpperCase() ?? WAVE}
              </div>
            )}
          </div>
          {isAdmin && (
            <Link href="/admin" className="flex-shrink-0 text-xl leading-none" aria-label="Admin">
              🔑
            </Link>
          )}
        </motion.div>

        {/* Tags */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, delay: 0.10 }}
          className="glass-card rounded-2xl p-4 flex flex-col gap-3 cursor-text"
          onClick={() => inputRef.current?.focus()}>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text2)' }}>Zoekwoorden</p>
          <div className="flex flex-wrap gap-2">
            {tags.map(tag => (
              <span key={tag} className="badge-accent flex items-center gap-1.5 text-sm font-medium px-3 py-1 rounded-full">
                {tag}
                <button onClick={e => { e.stopPropagation(); removeTag(tag); }}
                  className="flex items-center justify-center w-4 h-4 rounded-full opacity-60 hover:opacity-100 transition-opacity"
                  style={{ color: 'var(--accent)' }}><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
          <input ref={inputRef} type="text" value={tagInput} onChange={e => setTagInput(e.target.value)}
            onKeyDown={onTagKeyDown} onBlur={() => { if (tagInput.trim()) addTag(tagInput); }}
            placeholder={`Geef een functie in${ELLIPSIS}`} className="bg-transparent text-sm outline-none w-full"
            style={{ color: 'var(--text)' }} />
        </motion.div>

        {/* Search button */}
        <motion.button initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, delay: 0.16 }}
          onClick={runPipeline} disabled={loading}
          data-walkthrough="zoek-knop"
          className="glass-btn-accent w-full py-4 rounded-2xl text-base font-semibold active:scale-95 transition-transform duration-100 disabled:opacity-40">
          {loading ? `Gestart${ELLIPSIS}` : 'Zoeken'}
        </motion.button>

        {/* Progress */}
        <AnimatePresence>
          {(loading || progress > 0) && (
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.24 }}
              className="glass-card rounded-2xl px-4 py-4 flex flex-col gap-3">
              <div className="flex justify-between items-center text-xs" style={{ color: 'var(--text2)' }}>
                <span className="flex items-center gap-2">
                  {loading && <Lottie animationData={loaderDots} loop autoplay style={{ width: 32, height: 20 }} />}
                  {status || 'Ready'}
                </span>
                <motion.span key={Math.round(progress / 5)} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }} className="tabular-nums font-semibold" style={{ color: 'var(--accent)' }}>
                  {Math.round(progress)}%
                </motion.span>
              </div>
              <ProgressBar value={progress} loading={loading} />
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
            </motion.div>
          )}
        </AnimatePresence>

        {/* Logs */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => setShowLog(v => !v)} className="flex items-center gap-1 text-xs" style={{ color: 'var(--text2)' }}>
              <motion.span animate={{ rotate: showLog ? 0 : -90 }} transition={{ duration: 0.18 }}>
                <ChevronDown className="w-3 h-3" />
              </motion.span>
              Live logs
            </button>
            <AnimatePresence>
              {showLog && runLog.length > 0 && (
                <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  onClick={copyLogs}
                  className="glass flex items-center gap-1 text-xs px-2 py-1 rounded-lg"
                  style={{ color: copied ? 'var(--green)' : 'var(--text2)', border: `1px solid ${copied ? 'var(--green)' : 'var(--border)'}` }}>
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Gekopieerd!' : 'Kopieer'}
                </motion.button>
              )}
            </AnimatePresence>
          </div>
          <AnimatePresence>
            {showLog && (
              <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
                className="glass rounded-xl px-3 py-2.5 max-h-52 overflow-auto font-mono flex flex-col">
                {runLog.length ? runLog.map((entry, i) => <LogLine key={i} entry={entry} />) : <span style={{ color: 'var(--text2)', fontSize: 11 }}>{DASH}</span>}
                <div ref={logEndRef} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </main>
  );
}
