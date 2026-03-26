"use client";

import Link from 'next/link';
import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';
import Lottie from 'lottie-react';
import loaderDots from './lotties/loader-dots.json';
import { ChevronDown, ChevronRight, X, Copy, Check } from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';
import MoneyRain from '@/components/MoneyRain';

const WAVE     = String.fromCodePoint(0x1F44B);
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

function ls<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch { return fallback; }
}

// ── Log line classification ───────────────────────────────────────────────────
type LogLevel = 'success' | 'error' | 'warn' | 'info' | 'meta';

interface LogEntry {
  ts: string;
  level: LogLevel;
  message: string;
}

function classifyLog(raw: string): LogLevel {
  const t = raw.toLowerCase();
  if (t.includes('\u2713') || t.includes('inserted') || t.includes('queued') || t.startsWith('✓')) return 'success';
  if (t.includes('\u2717') || t.includes('error') || t.startsWith('✗')) return 'error';
  if (t.includes('\u26a0') || t.includes('warn') || t.includes('skip') || t.includes('groq_skipped')) return 'warn';
  if (t.startsWith('tags:') || t.startsWith('\u2192')) return 'meta';
  return 'info';
}

// CSS-var colours per level — work in both light and dark
const LEVEL_STYLES: Record<LogLevel, { badge: string; badgeBg: string; msg: string }> = {
  success: { badge: 'var(--green)',  badgeBg: 'rgba(74,222,128,0.13)',  msg: 'var(--green)'  },
  error:   { badge: 'var(--red)',    badgeBg: 'rgba(248,113,113,0.13)', msg: 'var(--red)'    },
  warn:    { badge: 'var(--yellow)', badgeBg: 'rgba(251,191,36,0.13)',  msg: 'var(--yellow)' },
  info:    { badge: 'var(--accent)', badgeBg: 'rgba(99,102,241,0.10)',  msg: 'var(--text3)'  },
  meta:    { badge: 'var(--text2)',  badgeBg: 'rgba(136,136,144,0.10)', msg: 'var(--text2)'  },
};

const LEVEL_LABEL: Record<LogLevel, string> = {
  success: 'OK',
  error:   'ERR',
  warn:    'WARN',
  info:    'LOG',
  meta:    'INF',
};

function LogLine({ entry, index }: { entry: LogEntry; index: number }) {
  const s = LEVEL_STYLES[entry.level];
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.16, delay: index === 0 ? 0 : 0 }}
      className="flex items-start gap-2 leading-snug py-0.5"
    >
      {/* timestamp */}
      <span className="flex-shrink-0 tabular-nums" style={{ color: 'var(--text2)', fontSize: 10, paddingTop: 1 }}>
        {entry.ts}
      </span>
      {/* badge */}
      <span
        className="flex-shrink-0 font-bold rounded px-1"
        style={{
          fontSize: 9,
          letterSpacing: '0.06em',
          color: s.badge,
          background: s.badgeBg,
          border: `1px solid ${s.badge}44`,
          paddingTop: 1,
          paddingBottom: 1,
        }}
      >
        {LEVEL_LABEL[entry.level]}
      </span>
      {/* message */}
      <span style={{ color: s.msg, fontSize: 11, wordBreak: 'break-all' }}>
        {entry.message}
      </span>
    </motion.div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ value, loading }: { value: number; loading: boolean }) {
  const spring = useSpring(value, { stiffness: 60, damping: 20, mass: 0.8 });
  useEffect(() => { spring.set(value); }, [value, spring]);
  const width = useTransform(spring, (v) => `${v}%`);

  return (
    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface2)', position: 'relative' }}>
      <motion.div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ width, background: 'linear-gradient(90deg, var(--accent), #818cf8)' }}
      />
      {loading && (
        <motion.div
          className="absolute inset-y-0 rounded-full pointer-events-none"
          style={{
            width,
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%)',
            backgroundSize: '200% 100%',
          }}
          animate={{ backgroundPosition: ['200% 0', '-200% 0'] }}
          transition={{ repeat: Infinity, duration: 1.6, ease: 'linear' }}
        />
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Home() {
  const [loading, setLoading]   = useState(false);
  const [status, setStatus]     = useState('');
  const [progress, setProgress] = useState(0);
  const [showLog, setShowLog]   = useState(false);
  const [runLog, setRunLog]     = useState<LogEntry[]>([]);
  const [copied, setCopied]     = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const logEndRef               = useRef<HTMLDivElement>(null);
  const [tags, setTagsRaw]      = useState<string[]>(DEFAULT_TAGS);
  const [tagInput, setTagInput] = useState('');
  const inputRef                = useRef<HTMLInputElement>(null);
  const [hydrated, setHydrated] = useState(false);

  const [rainState, setRainState] = useState<'idle' | 'raining' | 'draining'>('idle');
  const onDrained = useCallback(() => setRainState('idle'), []);

  useEffect(() => {
    setTagsRaw(ls('ja_tags', DEFAULT_TAGS));
    setHydrated(true);
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    supabase.auth.getUser().then(({ data }) => {
      const u    = data?.user;
      const name = u?.user_metadata?.full_name || u?.user_metadata?.name || u?.email?.split('@')[0] || null;
      setUsername(name);
    });
  }, []);

  useEffect(() => {
    if (showLog) logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [runLog, showLog]);

  const setTags = (fn: (prev: string[]) => string[]) => {
    setTagsRaw((prev) => {
      const next = fn(prev);
      try { localStorage.setItem('ja_tags', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const addTag = (raw: string) => {
    const val = raw.trim();
    if (!val || tags.includes(val)) { setTagInput(''); return; }
    setTags((prev) => [...prev, val]);
    setTagInput('');
  };

  const removeTag = (tag: string) => setTags((prev) => prev.filter((t) => t !== tag));

  const onTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput); }
    if (e.key === 'Backspace' && tagInput === '' && tags.length > 0) setTags((prev) => prev.slice(0, -1));
  };

  const log = (message: string) => {
    const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const level = classifyLog(message);
    setRunLog((prev) => [...prev, { ts, level, message }]);
  };

  const copyLogs = () => {
    const text = runLog.map(e => `${e.ts}  [${e.level.toUpperCase()}]  ${e.message}`).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const runPipeline = async () => {
    if (tags.length === 0) { setStatus('Add at least one search tag.'); return; }
    setRunLog([]);
    setCopied(false);
    setShowLog(true);
    setLoading(true);
    setProgress(3);
    setRainState('raining');
    setStatus(`Zoeken naar vacatures${ELLIPSIS}`);
    log(`Tags: ${tags.join(', ')}`);

    try {
      setStatus(`Scraping Adzuna${ELLIPSIS}`);
      setProgress(10);

      const t0  = performance.now();
      const res = await fetch(
        `/api/scrape/stream?source=adzuna&tags=${encodeURIComponent(tags.join(','))}`,
        { method: 'POST' },
      );
      if (!res.body) throw new Error('No stream body');

      const reader   = res.body.getReader();
      const decoder  = new TextDecoder();
      let buffer     = '';
      let scrapeDone = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.type === 'log') {
              log(event.message);
              setProgress((p) => Math.min(p + 2, 65));
            } else if (event.type === 'done') {
              const ms = Math.round(performance.now() - t0);
              log(`${CHECK} adzuna inserted=${event.count} found=${event.total_found} (${prettyMs(ms)})`);
              scrapeDone = true;
            } else if (event.type === 'error') {
              const ms = Math.round(performance.now() - t0);
              log(`${CROSS} adzuna: ${event.message} (${prettyMs(ms)})`);
              scrapeDone = true;
            }
          } catch {}
        }
      }

      if (!scrapeDone) log(`${CROSS} adzuna: stream ended without result`);

      setProgress(70);
      setStatus(`Wachtrij aanmaken${ELLIPSIS}`);
      log(`${ARROW} process`);

      const p0  = performance.now();
      const pr  = await fetch('/api/process', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keywords: tags }) });
      const pMs = Math.round(performance.now() - p0);
      const pd  = await pr.json();

      if (!pr.ok) {
        const errMsg = pd.error || pd.message || `HTTP ${pr.status}`;
        setProgress(0); setStatus(`${WARN} ${errMsg}`); log(`${CROSS} process: ${errMsg}`);
      } else if (pd.success) {
        setProgress(100);
        setStatus(`${pd.count || 0} jobs gevonden ${DASH} bekijk ze snel!`);
        log(`${CHECK} process queued=${pd.count || 0}${pd.failed ? ` (${pd.failed} mislukt)` : ''} (${prettyMs(pMs)})`);
      } else {
        setProgress(100); setStatus(pd.message || 'Niets nieuws gevonden.'); log(`${CHECK} process: ${pd.message || 'niets nieuw'} (${prettyMs(pMs)})`);
      }
    } catch (err: any) {
      setProgress(0); setStatus(`Error: ${err.message}`); log(`ERROR: ${err.message}`);
    }

    setLoading(false);
    setRainState('draining');
  };

  if (!hydrated) return null;

  return (
    <main className="page-shell flex flex-col gap-6" style={{ position: 'relative' }}>

      {rainState !== 'idle' && (
        <MoneyRain
          active={rainState === 'raining'}
          draining={rainState === 'draining'}
          onDrained={onDrained}
        />
      )}

      <div className="flex flex-col gap-6" style={{ position: 'relative', zIndex: 1 }}>

        <motion.div
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
          className="flex flex-col gap-0.5"
        >
          <h1 className="text-4xl font-bold tracking-tight" style={{ color: 'var(--text)' }}>
            Hey{username ? `, ${username}` : ''} {WAVE}
          </h1>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.07 }}
          className="rounded-2xl p-4 flex flex-col gap-3 cursor-text"
          onClick={() => inputRef.current?.focus()}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}
        >
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text2)' }}>Search tags</p>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1.5 text-sm font-medium px-3 py-1 rounded-full"
                style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--accent)', border: '1px solid rgba(99,102,241,0.3)' }}
              >
                {tag}
                <button
                  onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
                  className="flex items-center justify-center w-4 h-4 rounded-full opacity-60 hover:opacity-100 transition-opacity"
                  style={{ color: 'var(--accent)' }}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <input
            ref={inputRef}
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={onTagKeyDown}
            onBlur={() => { if (tagInput.trim()) addTag(tagInput); }}
            placeholder={`Geef een functie in${ELLIPSIS}`}
            className="bg-transparent text-sm outline-none w-full"
            style={{ color: 'var(--text)' }}
          />
        </motion.div>

        <motion.button
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.14 }}
          onClick={runPipeline}
          disabled={loading}
          className="w-full py-4 rounded-2xl text-base font-semibold transition-all active:scale-95 disabled:opacity-40"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          {loading ? `Gestart${ELLIPSIS}` : 'Zoeken'}
        </motion.button>

        {(loading || progress > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl px-4 py-4 flex flex-col gap-3"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div className="flex justify-between items-center text-xs" style={{ color: 'var(--text2)' }}>
              <span className="flex items-center gap-2">
                {loading && (
                  <Lottie animationData={loaderDots} loop autoplay style={{ width: 32, height: 20 }} />
                )}
                {status || 'Ready'}
              </span>
              <motion.span
                key={Math.round(progress / 5)}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="tabular-nums font-semibold"
                style={{ color: 'var(--accent)' }}
              >
                {Math.round(progress)}%
              </motion.span>
            </div>
            <ProgressBar value={progress} loading={loading} />
          </motion.div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => setShowLog((v) => !v)} className="flex items-center gap-1 text-xs" style={{ color: 'var(--text2)' }}>
              {showLog ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              Live logs
            </button>
            {showLog && runLog.length > 0 && (
              <button
                onClick={copyLogs}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-all"
                style={{ color: copied ? 'var(--green)' : 'var(--text2)', background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            )}
          </div>
          {showLog && (
            <div
              className="rounded-xl px-3 py-2.5 max-h-52 overflow-auto font-mono flex flex-col"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              {runLog.length
                ? runLog.map((entry, i) => <LogLine key={i} entry={entry} index={i} />)
                : <span style={{ color: 'var(--text2)', fontSize: 11 }}>{DASH}</span>
              }
              <div ref={logEndRef} />
            </div>
          )}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.21 }}
        >
          <Link
            href="/queue"
            className="rounded-2xl px-5 py-4 flex items-center justify-between group"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}
          >
            <div>
              <p className="font-semibold" style={{ color: 'var(--text)' }}>Review Queue</p>
              <p className="text-sm" style={{ color: 'var(--text2)' }}>Swipe to review scraped jobs</p>
            </div>
            <span className="text-xl group-hover:translate-x-1 transition-transform" style={{ color: 'var(--accent)' }}>{ARROW}</span>
          </Link>
        </motion.div>

      </div>
    </main>
  );
}
