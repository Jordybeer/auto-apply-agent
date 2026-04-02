"use client";

import Link from 'next/link';
import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, useSpring, useTransform, AnimatePresence } from 'framer-motion';
import Lottie from 'lottie-react';
import loaderDots from './lotties/loader-dots.json';
import { ChevronDown, ChevronRight, X, Copy, Check, ArrowRight } from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';
import MoneyRain from '@/components/MoneyRain';
import DatabgLottie from '@/components/DatabgLottie';

const WAVE     = String.fromCodePoint(0x1F44B);
const PARTY    = String.fromCodePoint(0x1F389);
const ARROW    = '\u2192';
const DASH     = '\u2014';
const ELLIPSIS = '\u2026';
const CHECK    = '\u2713';
const CROSS    = '\u2717';
const WARN     = '\u26a0\ufe0f';
const CLOCK    = '\u23F0';

const prettyMs = (ms?: number) => {
  if (ms === undefined) return '';
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
};

const DEFAULT_TAGS = ['helpdesk', 'it support', 'servicedesk', 'applicatiebeheerder'];

type LogLevel = 'success' | 'error' | 'warn' | 'info' | 'meta';
interface LogEntry { ts: string; level: LogLevel; message: string; }

function classifyLog(raw: string): LogLevel {
  const t = raw.toLowerCase();
  if (t.includes('\u2713') || t.includes('inserted') || t.includes('queued') || t.startsWith('\u2713')) return 'success';
  if (t.includes('\u2717') || t.includes('error') || t.startsWith('\u2717')) return 'error';
  if (t.includes('\u26a0') || t.includes('warn') || t.includes('skip') || t.includes('groq_skipped')) return 'warn';
  if (t.startsWith('tags:') || t.startsWith('\u2192')) return 'meta';
  return 'info';
}

const LEVEL_STYLES: Record<LogLevel, { badge: string; badgeBg: string; msg: string }> = {
  success: { badge: 'var(--green)',  badgeBg: 'rgba(74,222,128,0.13)',  msg: 'var(--green)'  },
  error:   { badge: 'var(--red)',    badgeBg: 'rgba(248,113,113,0.13)', msg: 'var(--red)'    },
  warn:    { badge: 'var(--yellow)', badgeBg: 'rgba(251,191,36,0.13)',  msg: 'var(--yellow)' },
  info:    { badge: 'var(--accent)', badgeBg: 'rgba(99,102,241,0.10)',  msg: 'var(--text3)'  },
  meta:    { badge: 'var(--text2)',  badgeBg: 'rgba(136,136,144,0.10)', msg: 'var(--text2)'  },
};
const LEVEL_LABEL: Record<LogLevel, string> = { success: 'OK', error: 'ERR', warn: 'WARN', info: 'LOG', meta: 'INF' };

function LogLine({ entry }: { entry: LogEntry }) {
  const s = LEVEL_STYLES[entry.level];
  return (
    <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.16 }}
      className="flex items-start gap-2 leading-snug py-0.5">
      <span className="flex-shrink-0 tabular-nums" style={{ color: 'var(--text2)', fontSize: 10, paddingTop: 1 }}>{entry.ts}</span>
      <span className="flex-shrink-0 font-bold rounded px-1"
        style={{ fontSize: 9, letterSpacing: '0.06em', color: s.badge, background: s.badgeBg, border: `1px solid ${s.badge}44`, paddingTop: 1, paddingBottom: 1 }}>
        {LEVEL_LABEL[entry.level]}
      </span>
      <span style={{ color: s.msg, fontSize: 11, wordBreak: 'break-all' }}>{entry.message}</span>
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
        style={{ width, background: 'linear-gradient(90deg, var(--accent), #818cf8)' }} />
      {loading && (
        <motion.div className="absolute inset-y-0 rounded-full pointer-events-none"
          style={{ width, background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%)', backgroundSize: '200% 100%' }}
          animate={{ backgroundPosition: ['200% 0', '-200% 0'] }}
          transition={{ repeat: Infinity, duration: 1.6, ease: 'linear' }} />
      )}
    </div>
  );
}

function Skeleton({ w = '100%', h = 16, rounded = 8 }: { w?: string | number; h?: number; rounded?: number }) {
  return (
    <motion.div
      animate={{ opacity: [0.4, 0.8, 0.4] }}
      transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
      style={{ width: w, height: h, borderRadius: rounded, background: 'var(--surface2)' }}
    />
  );
}

// ---------------------------------------------------------------------------
// Animated dark/light toggle
// ---------------------------------------------------------------------------
function ThemeToggle({ theme, onToggle }: { theme: 'dark' | 'light'; onToggle: () => void }) {
  const isDark = theme === 'dark';
  return (
    <motion.button
      onClick={onToggle}
      aria-label={isDark ? 'Schakel naar licht thema' : 'Schakel naar donker thema'}
      whileTap={{ scale: 0.88 }}
      whileHover={{ scale: 1.08 }}
      className="relative flex items-center justify-center w-10 h-10 rounded-2xl overflow-hidden"
      style={{
        background: isDark ? 'rgba(30,30,40,0.72)' : 'rgba(255,255,255,0.72)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        border: isDark ? '1px solid rgba(99,102,241,0.3)' : '1px solid rgba(99,102,241,0.2)',
        boxShadow: isDark
          ? '0 2px 12px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)'
          : '0 2px 12px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.7)',
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isDark ? (
          <motion.svg
            key="moon"
            initial={{ rotate: -30, opacity: 0, scale: 0.7 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: 30, opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            width="18" height="18" viewBox="0 0 24 24"
            fill="none" stroke="#a5b4fc" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </motion.svg>
        ) : (
          <motion.svg
            key="sun"
            initial={{ rotate: 30, opacity: 0, scale: 0.7 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: -30, opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            width="18" height="18" viewBox="0 0 24 24"
            fill="none" stroke="#6366f1" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="5" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </motion.svg>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

interface DashStats { queue: number; saved: number; applied: number; lastScrape: string | null; }

const TILE_LINKS: Record<string, string> = {
  queue:   '/queue',
  saved:   '/saved',
  applied: '/applied',
};

function StatusDashboard({ refreshKey }: { refreshKey: number }) {
  const [stats, setStats] = useState<DashStats | null>(null);

  useEffect(() => {
    setStats(null);
    Promise.all([
      fetch('/api/queue').then(r => r.json()),
      fetch('/api/saved').then(r => r.json()),
      fetch('/api/applied').then(r => r.json()),
      fetch('/api/settings').then(r => r.json()),
    ]).then(([q, s, a, cfg]) => {
      setStats({
        queue:      q.applications?.length  ?? 0,
        saved:      s.applications?.length  ?? 0,
        applied:    a.applications?.length  ?? 0,
        lastScrape: cfg.last_scrape_at      ?? null,
      });
    }).catch(() => setStats({ queue: 0, saved: 0, applied: 0, lastScrape: null }));
  }, [refreshKey]);

  const tiles = [
    { label: 'Wachtrij',       key: 'queue',   color: 'var(--accent)' },
    { label: 'Bewaard',        key: 'saved',   color: '#a78bfa'       },
    { label: 'Gesolliciteerd', key: 'applied', color: 'var(--green)'  },
  ];

  const relativeTime = (iso: string) => {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60)    return 'net gedaan';
    if (diff < 3600)  return `${Math.floor(diff / 60)}m geleden`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}u geleden`;
    return `${Math.floor(diff / 86400)}d geleden`;
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
      className="glass-card rounded-2xl p-4 flex flex-col gap-3">

      <div className="grid grid-cols-3 gap-2">
        {tiles.map(tile => {
          const count = stats ? (stats[tile.key as keyof DashStats] as number) : null;
          const badge = count !== null ? String(count) : null;
          return (
            <Link key={tile.key} href={TILE_LINKS[tile.key]}
              className="glass flex flex-col items-center gap-1 rounded-xl py-3 px-2 relative transition-opacity hover:opacity-80"
              style={{ border: `1px solid ${tile.color}22` }}>
              {stats ? (
                <>
                  <span className="text-2xl font-bold tabular-nums leading-none"
                    style={{ color: count && count > 0 ? tile.color : 'var(--text2)' }}>
                    {badge ?? '0'}
                  </span>
                  <span className="text-xs text-center" style={{ color: 'var(--text2)' }}>{tile.label}</span>
                </>
              ) : (
                <div className="flex flex-col items-center gap-1.5 w-full">
                  <Skeleton w="40%" h={22} rounded={6} />
                  <Skeleton w="70%" h={10} rounded={4} />
                </div>
              )}
              {count !== null && count > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-white"
                  style={{ background: tile.color, fontSize: 9, fontWeight: 700 }}>
                  {count > 9 ? '9+' : count}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text2)' }}>
        <span>{CLOCK}</span>
        {stats ? (
          stats.lastScrape
            ? <span>Laatste scrape: <span style={{ color: 'var(--text)' }}>{relativeTime(stats.lastScrape)}</span></span>
            : <span>Nog niet gescrapet {DASH} druk op Zoeken om te starten</span>
        ) : <Skeleton w={160} h={10} rounded={4} />}
      </div>
    </motion.div>
  );
}

export default function Home() {
  const [loading, setLoading]       = useState(false);
  const [status, setStatus]         = useState('');
  const [progress, setProgress]     = useState(0);
  const [showLog, setShowLog]       = useState(false);
  const [runLog, setRunLog]         = useState<LogEntry[]>([]);
  const [copied, setCopied]         = useState(false);
  const [username, setUsername]     = useState<string | null>(null);
  const logEndRef                   = useRef<HTMLDivElement>(null);
  const [tags, setTagsRaw]          = useState<string[]>(DEFAULT_TAGS);
  const [tagInput, setTagInput]     = useState('');
  const inputRef                    = useRef<HTMLInputElement>(null);
  const [hydrated, setHydrated]     = useState(false);
  const [newCount, setNewCount]     = useState<number | null>(null);
  const [rainState, setRainState]   = useState<'idle' | 'raining' | 'draining'>('idle');
  const [dashKey, setDashKey]       = useState(0);
  const [theme, setTheme]           = useState<'dark' | 'light'>('dark');
  const onDrained = useCallback(() => setRainState('idle'), []);

  // Sync theme state from <html data-theme>
  useEffect(() => {
    const read = () => {
      const attr = document.documentElement.getAttribute('data-theme');
      setTheme(attr === 'light' ? 'light' : 'dark');
    };
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    setTheme(next);
    try { localStorage.setItem('ja_theme', next); } catch {}
  };

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    supabase.auth.getUser().then(({ data }) => {
      const u = data?.user;
      setUsername(u?.user_metadata?.full_name || u?.user_metadata?.name || u?.email?.split('@')[0] || null);
    });
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => {
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
      setProgress(70); setStatus(`Wachtrij aanmaken${ELLIPSIS}`); log(`${ARROW} process`);
      const p0  = performance.now();
      const pr  = await fetch('/api/process', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keywords: tags }) });
      const pMs = Math.round(performance.now() - p0);
      const pd  = await pr.json();
      if (!pr.ok) {
        const errMsg = pd.error || pd.message || `HTTP ${pr.status}`;
        setProgress(0); setStatus(`${WARN} ${errMsg}`); log(`${CROSS} process: ${errMsg}`);
      } else if (pd.success) {
        setProgress(100); setNewCount(pd.count || 0);
        setStatus(`${pd.count || 0} jobs gevonden ${DASH} bekijk ze snel!`);
        log(`${CHECK} process queued=${pd.count || 0}${pd.failed ? ` (${pd.failed} mislukt)` : ''} (${prettyMs(pMs)})`);
      } else {
        setProgress(100); setStatus(pd.message || 'Niets nieuws gevonden.');
        log(`${CHECK} process: ${pd.message || 'niets nieuw'} (${prettyMs(pMs)})`);
      }
    } catch (err: unknown) { setProgress(0); setStatus(`Error: ${(err as Error).message}`); log(`ERROR: ${(err as Error).message}`); }
    setLoading(false); setRainState('draining');
    setDashKey(k => k + 1);
  };

  if (!hydrated) return null;

  return (
    <main className="page-shell flex flex-col gap-5" style={{ position: 'relative' }}>
      {/* Full-page animated background */}
      <DatabgLottie theme={theme} />

      {rainState !== 'idle' && <MoneyRain active={rainState === 'raining'} draining={rainState === 'draining'} onDrained={onDrained} />}

      {/* Floating dark/light toggle — top-right, above dashboard */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: -6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
        style={{ position: 'absolute', top: 0, right: 0, zIndex: 20 }}
      >
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </motion.div>

      <div className="flex flex-col gap-5" style={{ position: 'relative', zIndex: 1 }}>

        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          {/* Pad right so heading doesn't overlap the toggle button */}
          <h1 className="text-4xl font-bold tracking-tight pr-14" style={{ color: 'var(--text)' }}>Hey{username ? `, ${username}` : ''} {WAVE}</h1>
        </motion.div>

        {/* Dashboard tiles */}
        <StatusDashboard refreshKey={dashKey} />

        {/* Search tags box — glass */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.07 }}
          className="glass-card rounded-2xl p-4 flex flex-col gap-3 cursor-text"
          onClick={() => inputRef.current?.focus()}>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text2)' }}>Search tags</p>
          <div className="flex flex-wrap gap-2">
            {tags.map(tag => (
              <span key={tag} className="flex items-center gap-1.5 text-sm font-medium px-3 py-1 rounded-full"
                style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--accent)', border: '1px solid rgba(99,102,241,0.3)' }}>
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

        {/* Search button — glass tinted with accent */}
        <motion.button initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.14 }}
          onClick={runPipeline} disabled={loading}
          className="w-full py-4 rounded-2xl text-base font-semibold transition-all active:scale-95 disabled:opacity-40"
          style={{
            background: theme === 'dark' ? 'rgba(99,102,241,0.75)' : 'rgba(79,70,229,0.80)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(99,102,241,0.4)',
            color: '#fff',
          }}>
          {loading ? `Gestart${ELLIPSIS}` : 'Zoeken'}
        </motion.button>

        {/* Progress panel — glass */}
        {(loading || progress > 0) && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
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
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <Link href="/queue"
                    className="flex items-center justify-between w-full px-4 py-3 rounded-xl text-sm font-semibold"
                    style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--accent)', border: '1px solid rgba(99,102,241,0.3)' }}>
                    <span>{PARTY} {newCount} nieuwe vacatures klaar om te reviewen</span>
                    <ArrowRight className="w-4 h-4 flex-shrink-0" />
                  </Link>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Log panel — glass */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => setShowLog(v => !v)} className="flex items-center gap-1 text-xs" style={{ color: 'var(--text2)' }}>
              {showLog ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              Live logs
            </button>
            {showLog && runLog.length > 0 && (
              <button onClick={copyLogs}
                className="glass flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-all"
                style={{ color: copied ? 'var(--green)' : 'var(--text2)', border: `1px solid ${copied ? 'var(--green)' : 'var(--border)'}` }}>
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            )}
          </div>
          {showLog && (
            <div className="glass rounded-xl px-3 py-2.5 max-h-52 overflow-auto font-mono flex flex-col">
              {runLog.length ? runLog.map((entry, i) => <LogLine key={i} entry={entry} />) : <span style={{ color: 'var(--text2)', fontSize: 11 }}>{DASH}</span>}
              <div ref={logEndRef} />
            </div>
          )}
        </div>

      </div>
    </main>
  );
}
