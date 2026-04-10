'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Terminal, Database, Zap, RefreshCw, Copy, Check, ChevronDown, ChevronUp,
  ChevronLeft, ChevronRight, AlertTriangle, Info, Bug, Play, Trash2,
  BarChart2, Shield, ArrowLeft, Sun, Moon,
} from 'lucide-react';
import Link from 'next/link';

const EASE = [0.16, 1, 0.3, 1] as const;
type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';
type AdminTab = 'pipeline' | 'stats' | 'logs';
const SOURCES = ['scrape', 'process', 'apply', 'analyse'] as const;
type Source = typeof SOURCES[number] | 'all';

interface StoredLog {
  id: string;
  level: LogLevel;
  source: string;
  message: string;
  meta?: Record<string, unknown> | null;
  user_id?: string | null;
  created_at: string;
}

interface DbStats {
  queue:   number;
  saved:   number;
  applied: number;
  errors:  number;
  logs:    number;
}

const LEVEL_META: Record<LogLevel, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  log:   { label: 'LOG',  color: 'var(--text2)',  bg: 'var(--surface2)',          icon: <Terminal size={11} /> },
  info:  { label: 'INFO', color: 'var(--accent)', bg: 'var(--accent-dim)',        icon: <Info size={11} /> },
  warn:  { label: 'WARN', color: 'var(--yellow)', bg: 'rgba(251,191,36,0.12)',   icon: <AlertTriangle size={11} /> },
  error: { label: 'ERR',  color: 'var(--red)',    bg: 'rgba(251,113,133,0.12)',  icon: <Bug size={11} /> },
  debug: { label: 'DBG',  color: 'var(--purple)', bg: 'rgba(167,139,250,0.12)', icon: <Zap size={11} /> },
};

const LEVEL_FILTERS = [
  { key: 'all'   as const, label: 'Alles' },
  { key: 'log'   as const, label: 'Log'   },
  { key: 'info'  as const, label: 'Info'  },
  { key: 'warn'  as const, label: 'Warn'  },
  { key: 'error' as const, label: 'Error' },
  { key: 'debug' as const, label: 'Debug' },
];

const PAGE_SIZE = 100;

// ─── Pipeline action ──────────────────────────────────────────────────────────
interface PipelineAction {
  id: string;
  label: string;
  description: string;
  endpoint: string;
  method: 'POST' | 'DELETE';
  color: string;
  icon: React.ReactNode;
  confirm?: string;
}

const PIPELINE_ACTIONS: PipelineAction[] = [
  {
    id: 'scrape',
    label: 'Scrape starten',
    description: 'Haalt nieuwe vacatures op van Adzuna en slaat ze op.',
    endpoint: '/api/scrape/stream',
    method: 'POST',
    color: 'var(--accent)',
    icon: <Play size={14} />,
  },
  {
    id: 'process',
    label: 'Verwerken',
    description: 'Scoort vacatures en genereert motivatiebrieven in de wachtrij.',
    endpoint: '/api/process',
    method: 'POST',
    color: 'var(--green)',
    icon: <Zap size={14} />,
  },
  {
    id: 'purge-queue',
    label: 'Wachtrij leegmaken',
    description: 'Verwijdert alle vacatures met status queue.',
    endpoint: '/api/queue/purge',
    method: 'DELETE',
    color: 'var(--red)',
    icon: <Trash2 size={14} />,
    confirm: 'Weet je zeker dat je de wachtrij wilt leegmaken?',
  },
];

// ─── Minimal theme toggle ─────────────────────────────────────────────────────
function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.getAttribute('data-theme') === 'dark');
  }, []);
  const toggle = () => {
    const next = dark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    setDark(!dark);
  };
  return (
    <button
      onClick={toggle}
      aria-label={dark ? 'Schakel naar licht' : 'Schakel naar donker'}
      className="flex items-center justify-center w-8 h-8 rounded-xl"
      style={{ border: '1px solid var(--border)', color: 'var(--text2)', background: 'var(--surface2)' }}
    >
      {dark ? <Sun size={14} /> : <Moon size={14} />}
    </button>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, color }: { label: string; value: number | null; color: string }) {
  return (
    <div className="glass-card rounded-2xl p-4 flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text2)' }}>{label}</span>
      <motion.span
        key={String(value)}
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-3xl font-bold tabular-nums"
        style={{ color }}
      >
        {value === null ? '…' : value}
      </motion.span>
    </div>
  );
}

// ─── Stored log row ───────────────────────────────────────────────────────────
function StoredLogRow({ log, expanded, onToggle }: { log: StoredLog; expanded: boolean; onToggle: () => void }) {
  const meta = LEVEL_META[log.level] ?? LEVEL_META.log;
  const hasMeta = !!log.meta && Object.keys(log.meta).length > 0;
  return (
    <motion.div layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: EASE }}
      className="font-mono text-xs border-b" style={{ borderColor: 'var(--border)', background: expanded ? meta.bg : undefined }}>
      <button onClick={hasMeta ? onToggle : undefined} className="w-full flex items-start gap-2 px-3 py-2 text-left"
        style={{ cursor: hasMeta ? 'pointer' : 'default' }}>
        <span className="flex-shrink-0 tabular-nums" style={{ color: 'var(--text2)', fontSize: 10 }}>
          {log.created_at.slice(0, 19).replace('T', ' ')}
        </span>
        <span className="flex-shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded font-bold uppercase"
          style={{ background: meta.bg, color: meta.color, fontSize: 9, lineHeight: 1.4 }}>
          {meta.icon}&nbsp;{meta.label}
        </span>
        <span className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded"
          style={{ background: 'var(--surface2)', color: 'var(--text2)', fontSize: 9 }}>
          {log.source}
        </span>
        <span className={`flex-1 break-all whitespace-pre-wrap ${expanded ? '' : 'line-clamp-2'}`} style={{ color: meta.color }}>
          {log.message}
        </span>
        {hasMeta && (
          <span className="flex-shrink-0" style={{ color: 'var(--text2)' }}>
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </span>
        )}
      </button>
      <AnimatePresence initial={false}>
        {expanded && hasMeta && (
          <motion.div key="meta" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE }} style={{ overflow: 'hidden' }}>
            <pre className="px-3 pb-2 text-xs overflow-x-auto" style={{ color: 'var(--text2)', fontSize: 10 }}>
              {JSON.stringify(log.meta, null, 2)}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Log viewer panel ─────────────────────────────────────────────────────────
function LogsPanel() {
  const [logs, setLogs]               = useState<StoredLog[]>([]);
  const [loading, setLoading]         = useState(true);
  const [levelFilter, setLevelFilter] = useState<LogLevel | 'all'>('all');
  const [sourceFilter, setSrcFilter]  = useState<Source>('all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [copied, setCopied]           = useState(false);
  const [clearing, setClearing]       = useState(false);
  const [cursors, setCursors]         = useState<string[]>([]);
  const [hasMore, setHasMore]         = useState(false);

  const load = useCallback(async (before?: string) => {
    setLoading(true);
    const p = new URLSearchParams({ limit: String(PAGE_SIZE + 1) });
    if (levelFilter  !== 'all') p.set('level',  levelFilter);
    if (sourceFilter !== 'all') p.set('source', sourceFilter);
    if (before) p.set('before', before);
    const res = await fetch(`/api/logs?${p}`);
    const d   = await res.json();
    const rows: StoredLog[] = d.logs ?? [];
    setHasMore(rows.length > PAGE_SIZE);
    setLogs(rows.slice(0, PAGE_SIZE));
    setExpandedIds(new Set());
    setLoading(false);
  }, [levelFilter, sourceFilter]);

  useEffect(() => { setCursors([]); load(); }, [load]);

  const goNext = useCallback(() => {
    const last = logs[logs.length - 1];
    if (!last) return;
    setCursors(prev => [...prev, last.created_at]);
    load(last.created_at);
  }, [logs, load]);

  const goPrev = useCallback(() => {
    const next = cursors.slice(0, -1);
    setCursors(next);
    load(next[next.length - 1]);
  }, [cursors, load]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  const clearAll = useCallback(async () => {
    if (!window.confirm('Alle logs verwijderen? Dit kan niet ongedaan worden.')) return;
    setClearing(true);
    await fetch('/api/logs?all=true', { method: 'DELETE' });
    setCursors([]);
    await load();
    setClearing(false);
  }, [load]);

  const copyAll = useCallback(() => {
    const text = logs.map(l =>
      `[${l.created_at}] [${l.level.toUpperCase()}] [${l.source}] ${l.message}${l.meta ? '\n' + JSON.stringify(l.meta, null, 2) : ''}`
    ).join('\n');
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }, [logs]);

  const counts = useMemo(() => {
    const c: Record<LogLevel, number> = { log: 0, info: 0, warn: 0, error: 0, debug: 0 };
    logs.forEach(l => { if (c[l.level] !== undefined) c[l.level]++; });
    return c;
  }, [logs]);

  const page = cursors.length + 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1.5 flex-wrap flex-1">
          {LEVEL_FILTERS.map(({ key, label }) => (
            <button key={key} onClick={() => setLevelFilter(key)}
              className="text-xs px-3 py-1.5 rounded-xl font-medium"
              style={{
                background: levelFilter === key ? 'var(--accent)' : 'var(--surface2)',
                color: levelFilter === key ? '#fff' : 'var(--text2)',
                border: `1px solid ${levelFilter === key ? 'var(--accent)' : 'var(--border)'}`,
                cursor: 'pointer', transition: 'all 0.18s ease',
              }}>
              {label}
              {key !== 'all' && counts[key as LogLevel] > 0 && (
                <span className="ml-1.5 tabular-nums" style={{ opacity: 0.7 }}>{counts[key as LogLevel]}</span>
              )}
            </button>
          ))}
        </div>
        <button onClick={() => { setCursors([]); load(); }} disabled={loading}
          className="glass-btn flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl"
          style={{ color: 'var(--accent)', cursor: 'pointer' }}>
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Ververs
        </button>
        <button onClick={copyAll}
          className="glass-btn-accent flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl" style={{ cursor: 'pointer' }}>
          <AnimatePresence mode="wait" initial={false}>
            {copied
              ? <motion.span key="ok" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1"><Check size={12} /> Gekopieerd</motion.span>
              : <motion.span key="cp" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1"><Copy size={12} /> Kopieer</motion.span>}
          </AnimatePresence>
        </button>
        <button onClick={clearAll} disabled={clearing}
          className="glass-btn flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl"
          style={{ color: 'var(--red)', border: '1px solid var(--red)', opacity: clearing ? 0.5 : 1, cursor: clearing ? 'not-allowed' : 'pointer' }}>
          <Trash2 size={12} className={clearing ? 'animate-spin' : ''} />
          {clearing ? 'Wissen…' : 'Wis alles'}
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs" style={{ color: 'var(--text3)' }}>Bron:</span>
        {(['all', ...SOURCES] as (Source | 'all')[]).map(src => (
          <button key={src} onClick={() => setSrcFilter(src as Source)}
            className="text-xs px-2.5 py-1 rounded-lg font-medium"
            style={{
              background: sourceFilter === src ? 'var(--surface2)' : 'transparent',
              color: sourceFilter === src ? 'var(--text)' : 'var(--text3)',
              border: `1px solid ${sourceFilter === src ? 'var(--accent)' : 'var(--border)'}`,
              cursor: 'pointer', transition: 'all 0.18s ease',
            }}>
            {src === 'all' ? 'Alle' : src}
          </button>
        ))}
      </div>

      <div className="glass-card rounded-2xl overflow-hidden flex flex-col"
        style={{ minHeight: 240, maxHeight: 'calc(100dvh - 360px)', overflowY: 'auto' }}>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <span className="text-xs" style={{ color: 'var(--text2)' }}>Laden…</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12">
            <Database size={24} style={{ color: 'var(--text2)' }} />
            <p className="text-xs" style={{ color: 'var(--text2)' }}>Geen logs gevonden.</p>
          </div>
        ) : logs.map(log => (
          <StoredLogRow key={log.id} log={log} expanded={expandedIds.has(log.id)} onToggle={() => toggleExpand(log.id)} />
        ))}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs" style={{ color: 'var(--text2)' }}>
          {logs.length} logs — pagina {page}
        </p>
        <div className="flex gap-1.5">
          <button onClick={goPrev} disabled={cursors.length === 0 || loading}
            className="glass-btn flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-xl"
            style={{ color: cursors.length === 0 ? 'var(--text4)' : 'var(--accent)', opacity: cursors.length === 0 ? 0.4 : 1, cursor: cursors.length === 0 ? 'not-allowed' : 'pointer' }}>
            <ChevronLeft size={12} /> Vorige
          </button>
          <button onClick={goNext} disabled={!hasMore || loading}
            className="glass-btn flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-xl"
            style={{ color: !hasMore ? 'var(--text4)' : 'var(--accent)', opacity: !hasMore ? 0.4 : 1, cursor: !hasMore ? 'not-allowed' : 'pointer' }}>
            Volgende <ChevronRight size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Stats panel ──────────────────────────────────────────────────────────────
function StatsPanel() {
  const [stats, setStats]     = useState<DbStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [q, s, a, l] = await Promise.all([
        fetch('/api/queue').then(r => r.json()),
        fetch('/api/saved').then(r => r.json()),
        fetch('/api/applied').then(r => r.json()),
        fetch('/api/logs?limit=1').then(r => r.json()),
      ]);
      setStats({
        queue:   q.applications?.length   ?? 0,
        saved:   s.applications?.length   ?? 0,
        applied: a.applications?.length   ?? 0,
        errors:  0,
        logs:    l.total ?? 0,
      });
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Wachtrij"       value={loading ? null : stats?.queue   ?? 0} color="var(--accent)"  />
        <StatCard label="Bewaard"        value={loading ? null : stats?.saved   ?? 0} color="var(--yellow)" />
        <StatCard label="Gesolliciteerd" value={loading ? null : stats?.applied ?? 0} color="var(--green)"  />
        <StatCard label="Logs totaal"    value={loading ? null : stats?.logs    ?? 0} color="var(--text2)"  />
      </div>
      <button onClick={load} disabled={loading}
        className="glass-btn flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm"
        style={{ color: 'var(--accent)', border: '1px solid var(--border)' }}>
        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        {loading ? 'Laden…' : 'Verversen'}
      </button>
    </div>
  );
}

// ─── Pipeline panel ───────────────────────────────────────────────────────────
function PipelinePanel() {
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const logRef = useRef<HTMLPreElement>(null);
  const [streamLog, setStreamLog] = useState<string[]>([]);

  const runAction = useCallback(async (action: PipelineAction) => {
    if (action.confirm && !window.confirm(action.confirm)) return;
    setRunning(action.id);
    setStreamLog([]);
    try {
      if (action.id === 'scrape') {
        const res = await fetch(action.endpoint, { method: action.method });
        if (!res.body) throw new Error('No stream');
        const reader  = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n'); buf = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const ev = JSON.parse(line);
              if (ev.type === 'log')   setStreamLog(p => [...p, ev.message]);
              if (ev.type === 'done')  setStreamLog(p => [...p, `✓ klaar — ${ev.count} nieuw`]);
              if (ev.type === 'error') setStreamLog(p => [...p, `✗ ${ev.message}`]);
            } catch {}
          }
        }
        setResults(prev => ({ ...prev, [action.id]: { ok: true, msg: 'Scrape voltooid.' } }));
      } else {
        const res = await fetch(action.endpoint, { method: action.method });
        const d   = await res.json();
        setResults(prev => ({ ...prev, [action.id]: { ok: res.ok, msg: d.message ?? (res.ok ? 'Klaar.' : 'Mislukt.') } }));
      }
    } catch (e) {
      setResults(prev => ({ ...prev, [action.id]: { ok: false, msg: String(e) } }));
    }
    setRunning(null);
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [streamLog]);

  return (
    <div className="flex flex-col gap-4">
      {PIPELINE_ACTIONS.map(action => {
        const res     = results[action.id];
        const isRunning = running === action.id;
        return (
          <motion.div key={action.id} layout className="glass-card rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{action.label}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text2)' }}>{action.description}</p>
              </div>
              <motion.button
                whileTap={{ scale: 0.93 }}
                onClick={() => runAction(action)}
                disabled={!!running}
                className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold"
                style={{
                  background: isRunning ? 'var(--surface2)' : action.color,
                  color: isRunning ? 'var(--text2)' : '#fff',
                  border: `1px solid ${action.color}`,
                  opacity: running && !isRunning ? 0.45 : 1,
                  cursor: running ? 'not-allowed' : 'pointer',
                  transition: 'all 0.18s ease',
                }}>
                {isRunning
                  ? <><RefreshCw size={12} className="animate-spin" /> Bezig…</>
                  : <>{action.icon} {action.label}</>}
              </motion.button>
            </div>

            {action.id === 'scrape' && streamLog.length > 0 && (
              <pre ref={logRef} className="text-xs rounded-xl px-3 py-2 overflow-auto max-h-36 font-mono"
                style={{ background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }}>
                {streamLog.join('\n')}
              </pre>
            )}

            <AnimatePresence>
              {res && (
                <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="text-xs px-3 py-1.5 rounded-lg"
                  style={{ background: res.ok ? 'var(--green-dim)' : 'var(--red-dim)', color: res.ok ? 'var(--green)' : 'var(--red)', border: `1px solid ${res.ok ? 'var(--green)' : 'var(--red)'}44` }}>
                  {res.ok ? '✓' : '✗'} {res.msg}
                </motion.p>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const router   = useRouter();
  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ), []);

  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab, setTab]       = useState<AdminTab>('pipeline');

  void supabase;

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => {
        if (!d.is_admin) router.replace('/settings');
        else setAuthed(true);
      })
      .catch(() => router.replace('/settings'));
  }, [router]);

  if (authed === null) return (
    <main className="page-shell flex items-center justify-center">
      <span className="text-sm" style={{ color: 'var(--text2)' }}>Toegang controleren…</span>
    </main>
  );

  const TABS: { key: AdminTab; label: string; icon: React.ReactNode }[] = [
    { key: 'pipeline', label: 'Pipeline',     icon: <Play size={13} /> },
    { key: 'stats',    label: 'Statistieken', icon: <BarChart2 size={13} /> },
    { key: 'logs',     label: 'Logs',         icon: <Database size={13} /> },
  ];

  return (
    <main className="page-shell flex flex-col gap-5">

      {/* ── Header row: back | 🔑 shield title | spacer | theme toggle ── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center gap-3"
      >
        {/* Back */}
        <Link
          href="/settings"
          className="glass flex items-center justify-center w-8 h-8 rounded-xl flex-shrink-0"
          style={{ border: '1px solid var(--border)', color: 'var(--text2)' }}
        >
          <ArrowLeft size={15} />
        </Link>

        {/* 🔑 + title */}
        <div className="flex items-center gap-2 flex-1">
          <span className="text-lg leading-none" aria-hidden>🔑</span>
          <Shield size={16} style={{ color: 'var(--accent)' }} />
          <h1 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Admin</h1>
        </div>

        {/* Theme toggle — right edge */}
        <ThemeToggle />
      </motion.div>

      {/* Tab bar */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}
        className="flex gap-1.5">
        {TABS.map(({ key, label, icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-xl font-medium flex-1 justify-center"
            style={{
              background: tab === key ? 'var(--accent)' : 'var(--surface2)',
              color: tab === key ? '#fff' : 'var(--text2)',
              border: `1px solid ${tab === key ? 'var(--accent)' : 'var(--border)'}`,
              cursor: 'pointer', transition: 'all 0.18s ease',
            }}>
            {icon} {label}
          </button>
        ))}
      </motion.div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.22, ease: EASE }}>
          {tab === 'pipeline' && <PipelinePanel />}
          {tab === 'stats'    && <StatsPanel />}
          {tab === 'logs'     && <LogsPanel />}
        </motion.div>
      </AnimatePresence>

    </main>
  );
}
