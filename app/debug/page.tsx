'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Play, Trash2, Copy, Check, ChevronDown, ChevronUp, X } from 'lucide-react';

// ── Log types (mirrors page.tsx) ─────────────────────────────────────────────

type LogLevel = 'success' | 'error' | 'warn' | 'info' | 'meta';

interface LogEntry {
  ts: string;
  level: LogLevel;
  message: string;
  raw: string; // original NDJSON line
}

function classifyLog(raw: string): LogLevel {
  const t = raw.toLowerCase();
  if (raw.startsWith('✓') || (t.includes('inserted') && !t.includes('0 new')) || t.includes('queued=')) return 'success';
  if (raw.startsWith('✗') || t.includes('error') || t.includes('failed') || t.includes('stream ended without') || t.includes('unknown error')) return 'error';
  if (t.includes('rate limit') || t.includes('empty html') || t.includes('401') || t.includes('429')) return 'warn';
  if (raw.startsWith('→') || raw.startsWith('▶') || t.startsWith('📊') || t.startsWith('tags:')) return 'meta';
  return 'info';
}

const LEVEL_STYLES: Record<LogLevel, { badge: string; badgeBg: string; msg: string }> = {
  success: { badge: 'var(--green)',  badgeBg: 'var(--green-dim)',       msg: 'var(--green)'  },
  error:   { badge: 'var(--red)',    badgeBg: 'var(--red-dim)',          msg: 'var(--red)'    },
  warn:    { badge: 'var(--yellow)', badgeBg: 'var(--yellow-dim)',       msg: 'var(--yellow)' },
  info:    { badge: 'var(--text3)',  badgeBg: 'rgba(136,136,144,0.08)', msg: 'var(--text2)'  },
  meta:    { badge: 'var(--accent)', badgeBg: 'var(--accent-dim)',       msg: 'var(--text3)'  },
};
const LEVEL_LABEL: Record<LogLevel, string> = { success: 'OK', error: 'ERR', warn: 'LET', info: 'LOG', meta: 'SYS' };

function now(): string {
  const d = new Date();
  const pad = (n: number, z = 2) => String(n).padStart(z, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

// ── Components ────────────────────────────────────────────────────────────────

function LogLine({ entry, showRaw }: { entry: LogEntry; showRaw: boolean }) {
  const s = LEVEL_STYLES[entry.level];
  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.12 }}
      className="flex flex-col gap-0.5 py-0.5"
    >
      <div className="flex items-start gap-2 leading-snug">
        <span className="flex-shrink-0 tabular-nums" style={{ color: 'var(--text3)', fontSize: 10, paddingTop: 1, minWidth: 80 }}>
          {entry.ts}
        </span>
        <span
          className="flex-shrink-0 font-bold rounded px-1"
          style={{
            fontSize: 9, letterSpacing: '0.07em',
            color: s.badge, background: s.badgeBg,
            border: `1px solid ${s.badge}55`,
            paddingTop: 1, paddingBottom: 1, minWidth: 28, textAlign: 'center',
          }}
        >
          {LEVEL_LABEL[entry.level]}
        </span>
        <span style={{ color: s.msg, fontSize: 11, wordBreak: 'break-all', lineHeight: 1.55 }}>
          {entry.message}
        </span>
      </div>
      {showRaw && entry.raw && (
        <div className="pl-28">
          <span style={{ color: 'var(--text4)', fontSize: 10, fontStyle: 'italic', wordBreak: 'break-all' }}>
            {entry.raw}
          </span>
        </div>
      )}
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check, Trash2, ChevronDown, ChevronUp, Terminal, AlertTriangle, Info, Bug, Zap, RefreshCw, Database } from 'lucide-react';

const EASE = [0.16, 1, 0.3, 1] as const;

type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';
type Tab = 'live' | 'stored';

interface LogEntry {
  id: number;
  level: LogLevel;
  timestamp: string;
  args: string[];
  stack?: string;
}

interface StoredLog {
  id: string;
  level: LogLevel;
  source: string;
  message: string;
  meta?: Record<string, unknown> | null;
  user_id?: string | null;
  created_at: string;
}

const LEVEL_META: Record<LogLevel, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  log:   { label: 'LOG',   color: 'var(--text2)',  bg: 'var(--surface2)',        icon: <Terminal size={11} /> },
  info:  { label: 'INFO',  color: 'var(--accent)', bg: 'var(--accent-dim)',     icon: <Info size={11} /> },
  warn:  { label: 'WARN',  color: 'var(--yellow)', bg: 'rgba(251,191,36,0.12)', icon: <AlertTriangle size={11} /> },
  error: { label: 'ERR',   color: 'var(--red)',    bg: 'rgba(251,113,133,0.12)', icon: <Bug size={11} /> },
  debug: { label: 'DBG',   color: 'var(--purple)', bg: 'rgba(167,139,250,0.12)', icon: <Zap size={11} /> },
};

const FILTERS: { key: LogLevel | 'all'; label: string }[] = [
  { key: 'all',   label: 'Alles' },
  { key: 'log',   label: 'Log' },
  { key: 'info',  label: 'Info' },
  { key: 'warn',  label: 'Warn' },
  { key: 'error', label: 'Error' },
  { key: 'debug', label: 'Debug' },
];

let _idCounter = 0;
const _originalConsole: Record<LogLevel, (...args: unknown[]) => void> = {} as never;
const _listeners: Set<(entry: LogEntry) => void> = new Set();
let _patched = false;

function patchConsole() {
  if (_patched || typeof window === 'undefined') return;
  _patched = true;
  const levels: LogLevel[] = ['log', 'info', 'warn', 'error', 'debug'];
  levels.forEach(level => {
    _originalConsole[level] = console[level].bind(console);
    (console[level] as (...args: unknown[]) => void) = (...args: unknown[]) => {
      _originalConsole[level](...args);
      const entry: LogEntry = {
        id: ++_idCounter,
        level,
        timestamp: new Date().toISOString(),
        args: args.map(a => {
          if (typeof a === 'string') return a;
          try { return JSON.stringify(a, null, 2); } catch { return String(a); }
        }),
        stack: level === 'error' ? new Error().stack?.split('\n').slice(2).join('\n') : undefined,
      };
      _listeners.forEach(fn => fn(entry));
    };
  });
}

function useConsoleLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  useEffect(() => {
    patchConsole();
    const handler = (entry: LogEntry) => setLogs(prev => [...prev.slice(-499), entry]);
    _listeners.add(handler);
    console.info('[Debug] Console interceptor actief.');
    return () => { _listeners.delete(handler); };
  }, []);
  return logs;
}

function formatArgs(args: string[]): string { return args.join(' '); }

function LogRow({ entry, expanded, onToggle }: { entry: LogEntry; expanded: boolean; onToggle: () => void }) {
  const meta = LEVEL_META[entry.level];
  const hasStack = !!entry.stack;
  const text = formatArgs(entry.args);
  const isMultiline = text.includes('\n') || text.length > 120 || hasStack;
  return (
    <motion.div layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: EASE }}
      className="font-mono text-xs border-b" style={{ borderColor: 'var(--border)', background: expanded ? meta.bg : undefined }}>
      <button onClick={isMultiline ? onToggle : undefined} className="w-full flex items-start gap-2 px-3 py-2 text-left"
        style={{ cursor: isMultiline ? 'pointer' : 'default' }}>
        <span className="flex-shrink-0 tabular-nums" style={{ color: 'var(--text2)', fontSize: 10 }}>{entry.timestamp.slice(11, 23)}</span>
        <span className="flex-shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded font-bold uppercase"
          style={{ background: meta.bg, color: meta.color, fontSize: 9, lineHeight: 1.4 }}>{meta.icon}&nbsp;{meta.label}</span>
        <span className={`flex-1 break-all whitespace-pre-wrap ${expanded ? '' : 'line-clamp-2'}`} style={{ color: meta.color }}>{text}</span>
        {isMultiline && <span className="flex-shrink-0" style={{ color: 'var(--text2)' }}>{expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</span>}
      </button>
      <AnimatePresence initial={false}>
        {expanded && hasStack && (
          <motion.div key="stack" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE }} style={{ overflow: 'hidden' }}>
            <pre className="px-3 pb-2 text-xs overflow-x-auto" style={{ color: 'var(--text2)', fontSize: 10 }}>{entry.stack}</pre>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-2 text-xs"
      style={{ color: on ? 'var(--accent)' : 'var(--text3)' }}
    >
      <span
        className="relative inline-flex h-4 w-7 flex-shrink-0 rounded-full transition-colors"
        style={{ background: on ? 'var(--accent)' : 'var(--surface2)', border: '1px solid var(--border)' }}
      >
        <span
          className="absolute top-0.5 h-3 w-3 rounded-full transition-transform"
          style={{
            background: on ? 'white' : 'var(--text3)',
            transform: on ? 'translateX(14px)' : 'translateX(1px)',
          }}
        />
      </span>
      {label}
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'scraping' | 'processing' | 'done' | 'error';

export default function DebugPage() {
  const router = useRouter();

  // Admin guard
  const [adminChecked, setAdminChecked] = useState(false);

  // Pipeline state
  const [phase, setPhase]         = useState<Phase>('idle');
  const [logs, setLogs]           = useState<LogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showRaw, setShowRaw]     = useState(false);
  const [copied, setCopied]       = useState(false);
  const [duration, setDuration]   = useState<number | null>(null);
  const [summary, setSummary]     = useState<{ inserted: number; total_found: number } | null>(null);
  const startedAtRef              = useRef<number | null>(null);
  const logEndRef                 = useRef<HTMLDivElement>(null);

  // Tag input
  const [tags, setTags]           = useState<string[]>([]);
  const [tagInput, setTagInput]   = useState('');
  const tagInputRef               = useRef<HTMLInputElement>(null);

  // Admin check + load keywords
  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => {
        if (!d.is_admin) { router.replace('/settings'); return; }
        setTags(d.keywords ?? []);
        setAdminChecked(true);
      })
      .catch(() => router.replace('/settings'));
  }, [router]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll) logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, autoScroll]);

  const addLog = useCallback((message: string, rawLine = '') => {
    setLogs(prev => [...prev, { ts: now(), level: classifyLog(message), message, raw: rawLine }]);
  }, []);

  const addMeta = useCallback((message: string) => {
    setLogs(prev => [...prev, { ts: now(), level: 'meta', message, raw: '' }]);
  }, []);

  // ── Tag input helpers ────────────────────────────────────────────────────
  const addTag = (raw: string) => {
    const val = raw.trim().toLowerCase();
    if (!val || tags.includes(val)) { setTagInput(''); return; }
    setTags(prev => [...prev, val]);
    setTagInput('');
  };

  const removeTag = (tag: string) => setTags(prev => prev.filter(t => t !== tag));

  const onTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput); }
    if (e.key === 'Backspace' && tagInput === '' && tags.length > 0) setTags(prev => prev.slice(0, -1));
  };

  // ── Pipeline execution ───────────────────────────────────────────────────
  const runPipeline = async () => {
    setLogs([]);
    setSummary(null);
    setDuration(null);
    setCopied(false);
    setPhase('scraping');
    startedAtRef.current = performance.now();

    const query = tags.length > 0 ? `?tags=${encodeURIComponent(tags.join(','))}` : '';
    addMeta(`▶ Pipeline start — sources: Adzuna, VDAB, Jobat, Stepstone, Indeed${tags.length ? ` | tags: ${tags.join(', ')}` : ' | default keywords'}`);

    try {
      // ── Phase 1: scrape stream ─────────────────────────────────────────
      const t0  = performance.now();
      const res = await fetch(`/api/scrape/stream${query}`, { method: 'POST' });
      if (!res.body) throw new Error('No stream body from /api/scrape/stream');

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let scrapeDone = false;
      let scrapeInserted = 0;
      let scrapeFound = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const ev = JSON.parse(line);
            if (ev.type === 'log') {
              addLog(ev.message, line);
            } else if (ev.type === 'done') {
              const ms = Math.round(performance.now() - t0);
              scrapeInserted = ev.count ?? 0;
              scrapeFound    = ev.total_found ?? 0;
              addLog(`✓ scrape done — inserted ${scrapeInserted}, found ${scrapeFound} (${(ms / 1000).toFixed(1)}s)`, line);
              scrapeDone = true;
            } else if (ev.type === 'error') {
              addLog(`✗ scrape error: ${ev.message}`, line);
              scrapeDone = true;
            }
          } catch {}
        }
      }
      if (!scrapeDone) addLog('✗ stream ended without done event');

      // ── Phase 2: process ──────────────────────────────────────────────
      setPhase('processing');
      addMeta('→ running /api/process…');
      const p0 = performance.now();
      const pr = await fetch('/api/process', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const pd = await pr.json().catch(() => ({}));
      const pMs = Math.round(performance.now() - p0);

      if (!pr.ok) {
        addLog(`✗ process error: ${pd.error ?? `HTTP ${pr.status}`}`);
        setPhase('error');
      } else {
        const count = pd.count ?? 0;
        addLog(`✓ process done — ${count} new application${count !== 1 ? 's' : ''} created (${(pMs / 1000).toFixed(1)}s)`);
        setPhase('done');
        setSummary({ inserted: scrapeInserted, total_found: scrapeFound });
      }
    } catch (err: unknown) {
      addLog(`✗ pipeline error: ${(err as Error).message}`);
      setPhase('error');
    }

    const elapsed = Math.round(performance.now() - (startedAtRef.current ?? 0));
    setDuration(elapsed);
    addMeta(`▶ Pipeline finished — total time ${(elapsed / 1000).toFixed(1)}s`);
  };

  const clearLogs = () => {
    setLogs([]);
    setSummary(null);
    setDuration(null);
    setPhase('idle');
  };

  const copyLogs = () => {
    const text = logs
      .map(e => `${e.ts}  [${LEVEL_LABEL[e.level]}]  ${e.message}${showRaw && e.raw ? `\n       ${e.raw}` : ''}`)
      .join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const running = phase === 'scraping' || phase === 'processing';

  // ── Loading / guard ──────────────────────────────────────────────────────
  if (!adminChecked) {
    return (
      <main className="page-shell flex items-center justify-center" style={{ minHeight: '60vh' }}>
        <span style={{ color: 'var(--text3)', fontSize: 14 }}>Controleren…</span>
      </main>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <main className="page-shell flex flex-col gap-4" style={{ paddingBottom: 'calc(var(--navbar-h) + 1.5rem)' }}>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="flex items-center justify-center w-9 h-9 rounded-xl flex-shrink-0"
          style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent)33' }}
        >
          <Terminal className="w-4 h-4" style={{ color: 'var(--accent)' }} />
        </div>
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Debug Console</h1>
          <p className="text-xs" style={{ color: 'var(--text3)' }}>Verbose pipeline logs · admin only</p>
        </div>
      </div>

      {/* Controls */}
      <div className="glass-card rounded-2xl p-4 flex flex-col gap-3">
        {/* Tag pills */}
        <div>
          <p className="field-label mb-1.5">Zoektermen</p>
          <div
            className="flex flex-wrap gap-1.5 rounded-xl px-3 py-2 cursor-text"
            style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', minHeight: 40 }}
            onClick={() => tagInputRef.current?.focus()}
          >
            <AnimatePresence>
              {tags.map(tag => (
                <motion.span
                  key={tag}
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  className="flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium"
                  style={{ background: 'var(--accent-dim)', color: 'var(--accent-bright)', border: '1px solid var(--accent)33' }}
                >
                  {tag}
                  <button onClick={(e) => { e.stopPropagation(); removeTag(tag); }} style={{ color: 'var(--accent)', opacity: 0.7 }}>
                    <X className="w-3 h-3" />
                  </button>
                </motion.span>
              ))}
            </AnimatePresence>
            <input
              ref={tagInputRef}
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={onTagKeyDown}
              onBlur={() => tagInput && addTag(tagInput)}
              placeholder={tags.length === 0 ? 'Voeg zoekterm toe…' : ''}
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: 'var(--text)', minWidth: 100, fontSize: 13 }}
              disabled={running}
            />
          </div>
          <p className="text-xs mt-1" style={{ color: 'var(--text4)' }}>
            Enter of komma om te bevestigen · leeg = standaard zoektermen
          </p>
        </div>

        {/* Action row */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={runPipeline}
            disabled={running}
            className="btn btn-primary btn-sm flex items-center gap-1.5"
          >
            {running ? (
              <>
                <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'white' }} />
                {phase === 'scraping' ? 'Scraping…' : 'Processing…'}
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                Run Pipeline
              </>
            )}
          </button>

          <button
            onClick={clearLogs}
            disabled={running}
            className="btn btn-secondary btn-sm flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </button>

          <div className="flex items-center gap-3 ml-auto">
            <Toggle on={showRaw} onToggle={() => setShowRaw(v => !v)} label="Raw JSON" />
            <Toggle on={autoScroll} onToggle={() => setAutoScroll(v => !v)} label="Auto-scroll" />
          </div>
        </div>
      </div>

      {/* Log panel */}
      <div className="glass-card rounded-2xl flex flex-col overflow-hidden" style={{ minHeight: 400, maxHeight: 'calc(100dvh - 380px)' }}>
        {/* Panel header */}
        <div
          className="flex items-center justify-between px-4 py-2.5 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--divider)' }}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium" style={{ color: 'var(--text2)' }}>
              Output
            </span>
            {logs.length > 0 && (
              <span
                className="text-xs rounded-full px-1.5 py-0.5 tabular-nums"
                style={{ background: 'var(--surface2)', color: 'var(--text3)', fontSize: 10 }}
              >
                {logs.length} lijnen
              </span>
            )}
            {running && (
              <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--accent)' }}>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--accent)' }} />
                Streaming…
              </span>
            )}
          </div>
          <button
            onClick={copyLogs}
            disabled={logs.length === 0}
            className="btn btn-ghost-accent btn-sm flex items-center gap-1.5"
            style={{ opacity: logs.length === 0 ? 0.4 : 1 }}
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Gekopieerd!' : 'Kopieer'}
          </button>
        </div>

        {/* Log content */}
        <div className="flex-1 overflow-y-auto px-4 py-3 font-mono" style={{ overscrollBehavior: 'contain' }}>
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2" style={{ minHeight: 200 }}>
              <Terminal className="w-8 h-8" style={{ color: 'var(--text4)' }} />
              <p className="text-sm" style={{ color: 'var(--text4)' }}>
                Nog geen logs. Klik op <strong>Run Pipeline</strong> om te starten.
              </p>
            </div>
          ) : (
            <div className="flex flex-col">
              {logs.map((entry, i) => (
                <LogLine key={i} entry={entry} showRaw={showRaw} />
              ))}
              <div ref={logEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* Summary bar — only after done */}
      <AnimatePresence>
        {phase === 'done' && summary && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="glass-card rounded-2xl px-4 py-3 flex items-center gap-4 flex-wrap"
          >
            <span className="text-xs font-medium" style={{ color: 'var(--text2)' }}>Resultaten</span>
            <span className="badge-green text-xs">
              {summary.inserted} nieuwe jobs ingevoegd
            </span>
            <span
              className="text-xs rounded-full px-2 py-0.5"
              style={{ background: 'var(--surface2)', color: 'var(--text3)' }}
            >
              {summary.total_found} gevonden
            </span>
            {duration !== null && (
              <span
                className="text-xs rounded-full px-2 py-0.5"
                style={{ background: 'var(--surface2)', color: 'var(--text3)' }}
              >
                {(duration / 1000).toFixed(1)}s totaal
              </span>
            )}
          </motion.div>
        )}
        {phase === 'error' && duration !== null && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="glass-card rounded-2xl px-4 py-3 flex items-center gap-3"
          >
            <span className="badge-red text-xs">Pipeline mislukt</span>
            <span className="text-xs" style={{ color: 'var(--text3)' }}>
              {(duration / 1000).toFixed(1)}s · Zie logs voor details
            </span>
          </motion.div>
        )}
      </AnimatePresence>

function StoredLogRow({ log, expanded, onToggle }: { log: StoredLog; expanded: boolean; onToggle: () => void }) {
  const meta = LEVEL_META[log.level] ?? LEVEL_META.log;
  const hasMeta = !!log.meta && Object.keys(log.meta).length > 0;
  return (
    <motion.div layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: EASE }}
      className="font-mono text-xs border-b" style={{ borderColor: 'var(--border)', background: expanded ? meta.bg : undefined }}>
      <button onClick={hasMeta ? onToggle : undefined} className="w-full flex items-start gap-2 px-3 py-2 text-left"
        style={{ cursor: hasMeta ? 'pointer' : 'default' }}>
        <span className="flex-shrink-0 tabular-nums" style={{ color: 'var(--text2)', fontSize: 10 }}>{log.created_at.slice(0, 19).replace('T', ' ')}</span>
        <span className="flex-shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded font-bold uppercase"
          style={{ background: meta.bg, color: meta.color, fontSize: 9, lineHeight: 1.4 }}>{meta.icon}&nbsp;{meta.label}</span>
        <span className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded"
          style={{ background: 'var(--surface2)', color: 'var(--text2)', fontSize: 9 }}>{log.source}</span>
        <span className={`flex-1 break-all whitespace-pre-wrap ${expanded ? '' : 'line-clamp-2'}`} style={{ color: meta.color }}>{log.message}</span>
        {hasMeta && <span className="flex-shrink-0" style={{ color: 'var(--text2)' }}>{expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</span>}
      </button>
      <AnimatePresence initial={false}>
        {expanded && hasMeta && (
          <motion.div key="meta" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE }} style={{ overflow: 'hidden' }}>
            <pre className="px-3 pb-2 text-xs overflow-x-auto" style={{ color: 'var(--text2)', fontSize: 10 }}>{JSON.stringify(log.meta, null, 2)}</pre>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function StoredLogsPanel() {
  const [logs, setLogs] = useState<StoredLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<LogLevel | 'all'>('all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '200' });
    if (filter !== 'all') params.set('level', filter);
    const res = await fetch(`/api/logs?${params}`);
    const d = await res.json();
    setLogs(d.logs ?? []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }, []);

  const counts = useMemo(() => {
    const c: Record<LogLevel, number> = { log: 0, info: 0, warn: 0, error: 0, debug: 0 };
    logs.forEach(l => { if (c[l.level] !== undefined) c[l.level]++; });
    return c;
  }, [logs]);

  const copyAll = useCallback(() => {
    const text = logs.map(l =>
      `[${l.created_at}] [${l.level.toUpperCase()}] [${l.source}] ${l.message}${l.meta ? '\n' + JSON.stringify(l.meta, null, 2) : ''}`
    ).join('\n');
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }, [logs]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1.5 flex-wrap flex-1">
          {FILTERS.map(({ key, label }) => (
            <motion.button key={key} whileTap={{ scale: 0.9 }} onClick={() => setFilter(key)}
              className="text-xs px-3 py-1.5 rounded-xl font-medium"
              style={{ background: filter === key ? 'var(--accent)' : 'var(--surface2)', color: filter === key ? '#fff' : 'var(--text2)',
                border: `1px solid ${filter === key ? 'var(--accent)' : 'var(--border)'}`, cursor: 'pointer', transition: 'all 0.18s ease' }}>
              {label}{key !== 'all' && counts[key as LogLevel] > 0 && <span className="ml-1.5 tabular-nums text-xs" style={{ opacity: 0.75 }}>{counts[key as LogLevel]}</span>}
            </motion.button>
          ))}
        </div>
        <motion.button whileTap={{ scale: 0.93 }} onClick={load} disabled={loading}
          className="glass-btn flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl"
          style={{ color: 'var(--accent)', cursor: 'pointer' }}>
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Ververs
        </motion.button>
        <motion.button whileTap={{ scale: 0.93 }} onClick={copyAll}
          className="glass-btn-accent flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl" style={{ cursor: 'pointer' }}>
          <AnimatePresence mode="wait" initial={false}>
            {copied
              ? <motion.span key="ok" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1"><Check size={12} /> Gekopieerd</motion.span>
              : <motion.span key="cp" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1"><Copy size={12} /> Kopieer alles</motion.span>}
          </AnimatePresence>
        </motion.button>
      </div>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }}
        className="glass-card rounded-2xl overflow-hidden flex flex-col"
        style={{ minHeight: 300, maxHeight: 'calc(100dvh - 280px)', overflowY: 'auto' }}>
        {loading ? (
          <div className="flex items-center justify-center py-16"><span className="text-xs" style={{ color: 'var(--text2)' }}>Laden...</span></div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16">
            <Database size={28} style={{ color: 'var(--text2)' }} />
            <p className="text-xs" style={{ color: 'var(--text2)' }}>Geen opgeslagen logs{filter !== 'all' ? ` voor niveau "${filter}"` : ''}.</p>
          </div>
        ) : logs.map(log => (
          <StoredLogRow key={log.id} log={log} expanded={expandedIds.has(log.id)} onToggle={() => toggleExpand(log.id)} />
        ))}
      </motion.div>
      <p className="text-xs text-center" style={{ color: 'var(--text2)' }}>{logs.length} logs — meest recent bovenaan — bewaard 7 dagen.</p>
    </div>
  );
}

export default function DebugPage() {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!), []);

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>('stored');
  const [filter, setFilter] = useState<LogLevel | 'all'>('all');
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const logs = useConsoleLogs();

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(d => {
      if (!d.is_admin) router.replace('/settings'); else setIsAdmin(true);
    }).catch(() => router.replace('/settings'));
  }, [router]);

  useEffect(() => {
    if (autoScroll && tab === 'live') bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, autoScroll, tab]);

  const filtered = useMemo(() => filter === 'all' ? logs : logs.filter(l => l.level === filter), [logs, filter]);

  const toggleExpand = useCallback((id: number) => {
    setExpandedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }, []);

  const copyAll = useCallback(() => {
    const text = filtered.map(e => `[${e.timestamp}] [${e.level.toUpperCase()}] ${formatArgs(e.args)}${e.stack ? '\n' + e.stack : ''}`).join('\n');
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }, [filtered]);

  const counts = useMemo(() => {
    const c: Record<LogLevel, number> = { log: 0, info: 0, warn: 0, error: 0, debug: 0 };
    logs.forEach(l => c[l.level]++);
    return c;
  }, [logs]);

  if (isAdmin === null) return (
    <main className="page-shell flex items-center justify-center"><span className="text-secondary text-sm">Laden...</span></main>
  );

  return (
    <main className="page-shell flex flex-col gap-4" style={{ position: 'relative', zIndex: 1 }}>
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Debug Logs</h1>
        <span className="badge-accent text-xs px-1.5 py-0.5 rounded font-mono">admin</span>
      </div>

      <div className="flex gap-1.5">
        {([{ key: 'stored', label: 'Opgeslagen', icon: <Database size={12} /> }, { key: 'live', label: 'Live console', icon: <Terminal size={12} /> }] as { key: Tab; label: string; icon: React.ReactNode }[]).map(({ key, label, icon }) => (
          <motion.button key={key} whileTap={{ scale: 0.93 }} onClick={() => setTab(key)}
            className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-xl font-medium"
            style={{ background: tab === key ? 'var(--accent)' : 'var(--surface2)', color: tab === key ? '#fff' : 'var(--text2)',
              border: `1px solid ${tab === key ? 'var(--accent)' : 'var(--border)'}`, cursor: 'pointer', transition: 'all 0.18s ease' }}>
            {icon}{label}
          </motion.button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {tab === 'stored' && (
          <motion.div key="stored" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: EASE }}>
            <StoredLogsPanel />
          </motion.div>
        )}
        {tab === 'live' && (
          <motion.div key="live" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: EASE }} className="flex flex-col gap-4">
            <div className="glass-card flex items-center gap-3 rounded-2xl px-4 py-2.5 flex-wrap">
              {(['log', 'info', 'warn', 'error', 'debug'] as LogLevel[]).map(lvl => {
                const m = LEVEL_META[lvl];
                return (
                  <div key={lvl} className="flex items-center gap-1">
                    <span style={{ color: m.color, fontSize: 10 }}>{m.icon}</span>
                    <span className="text-xs tabular-nums font-mono" style={{ color: m.color }}>{counts[lvl]}</span>
                    <span className="text-xs" style={{ color: 'var(--text2)' }}>{m.label}</span>
                  </div>
                );
              })}
              <div className="ml-auto text-xs" style={{ color: 'var(--text2)' }}>{logs.length} totaal</div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex gap-1.5 flex-wrap flex-1">
                {FILTERS.map(({ key, label }) => (
                  <motion.button key={key} whileTap={{ scale: 0.9 }} onClick={() => setFilter(key)}
                    className="text-xs px-3 py-1.5 rounded-xl font-medium"
                    style={{ background: filter === key ? 'var(--accent)' : 'var(--surface2)', color: filter === key ? '#fff' : 'var(--text2)',
                      border: `1px solid ${filter === key ? 'var(--accent)' : 'var(--border)'}`, cursor: 'pointer', transition: 'all 0.18s ease' }}>
                    {label}{key !== 'all' && counts[key as LogLevel] > 0 && <span className="ml-1.5 tabular-nums text-xs" style={{ opacity: 0.75 }}>{counts[key as LogLevel]}</span>}
                  </motion.button>
                ))}
              </div>
              <motion.button whileTap={{ scale: 0.93 }} onClick={() => setAutoScroll(v => !v)}
                className="glass-btn flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl"
                style={{ color: autoScroll ? 'var(--accent)' : 'var(--text2)', cursor: 'pointer' }}>
                <Zap size={12} />{autoScroll ? 'Live' : 'Gepauzeerd'}
              </motion.button>
              <motion.button whileTap={{ scale: 0.93 }} onClick={copyAll}
                className="glass-btn-accent flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl" style={{ cursor: 'pointer' }}>
                <AnimatePresence mode="wait" initial={false}>
                  {copied
                    ? <motion.span key="ok" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1"><Check size={12} /> Gekopieerd</motion.span>
                    : <motion.span key="cp" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1"><Copy size={12} /> Kopieer alles</motion.span>}
                </AnimatePresence>
              </motion.button>
            </div>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }}
              ref={containerRef} className="glass-card rounded-2xl overflow-hidden flex flex-col"
              style={{ minHeight: 300, maxHeight: 'calc(100dvh - 320px)', overflowY: 'auto' }}
              onScroll={e => { const el = e.currentTarget; setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 40); }}>
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16">
                  <Terminal size={28} style={{ color: 'var(--text2)' }} />
                  <p className="text-xs" style={{ color: 'var(--text2)' }}>Geen logs{filter !== 'all' ? ` voor niveau "${filter}"` : ''}.</p>
                </div>
              ) : filtered.map(entry => (
                <LogRow key={entry.id} entry={entry} expanded={expandedIds.has(entry.id)} onToggle={() => toggleExpand(entry.id)} />
              ))}
              <div ref={bottomRef} />
            </motion.div>
            <p className="text-xs text-center" style={{ color: 'var(--text2)' }}>Logs worden enkel in dit tabblad bijgehouden en verlopen bij page-refresh.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
