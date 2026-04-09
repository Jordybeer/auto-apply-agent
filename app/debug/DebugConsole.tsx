'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Play, Trash2, Copy, Check, X } from 'lucide-react';

// ── Log types ─────────────────────────────────────────────────────────────────

type LogLevel = 'success' | 'error' | 'warn' | 'info' | 'meta';

interface LogEntry {
  ts: string;
  level: LogLevel;
  message: string;
  raw: string;
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

// ── Main component ────────────────────────────────────────────────────────────

type Phase = 'idle' | 'scraping' | 'processing' | 'done' | 'error';

export default function DebugConsole({ initialKeywords }: { initialKeywords: string[] }) {
  // Pipeline state
  const [phase, setPhase]           = useState<Phase>('idle');
  const [logs, setLogs]             = useState<LogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showRaw, setShowRaw]       = useState(false);
  const [copied, setCopied]         = useState(false);
  const [duration, setDuration]     = useState<number | null>(null);
  const [summary, setSummary]       = useState<{ inserted: number; total_found: number } | null>(null);
  const startedAtRef                = useRef<number | null>(null);
  const logEndRef                   = useRef<HTMLDivElement>(null);

  // Tag input
  const [tags, setTags]         = useState<string[]>(initialKeywords);
  const [tagInput, setTagInput] = useState('');
  const tagInputRef             = useRef<HTMLInputElement>(null);

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

  // ── Tag input helpers ──────────────────────────────────────────────────────
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

  // ── Pipeline execution ─────────────────────────────────────────────────────
  const runPipeline = async () => {
    setLogs([]);
    setSummary(null);
    setDuration(null);
    setCopied(false);
    setPhase('scraping');
    startedAtRef.current = performance.now();

    const query = tags.length > 0 ? `?tags=${encodeURIComponent(tags.join(','))}` : '';
    addMeta(`▶ Pipeline start — sources: Adzuna, VDAB, Jobat, Stepstone${tags.length ? ` | tags: ${tags.join(', ')}` : ' | default keywords'}`);

    try {
      // ── Phase 1: scrape stream ───────────────────────────────────────────
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

      // ── Phase 2: process ─────────────────────────────────────────────────
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

  // ── Render ─────────────────────────────────────────────────────────────────
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

    </main>
  );
}
