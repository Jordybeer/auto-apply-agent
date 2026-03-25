"use client";

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import Lottie from 'lottie-react';
import loaderDots from './lotties/loader-dots.json';
import { ChevronDown, ChevronRight, X, Copy, Check, Lock } from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';

type Platform = 'adzuna' | 'vdab' | 'jobat' | 'stepstone' | 'ictjob' | 'indeed';
type PlatformState = {
  state: 'idle' | 'queued' | 'running' | 'done' | 'error';
  inserted?: number;
  found?: number;
  ms?: number;
  err?: string;
};

// Only platforms with a working backend implementation
const IMPLEMENTED_PLATFORMS: Platform[] = ['adzuna'];
const ALL_PLATFORMS: Platform[]         = ['adzuna', 'vdab', 'jobat', 'stepstone', 'ictjob', 'indeed'];

// Bump this key whenever the platform list shape changes to bust stale localStorage
const PLATFORMS_LS_KEY = 'ja_platforms_v2';

const prettyMs = (ms?: number) => {
  if (ms === undefined) return '';
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
};

const PLATFORM_COLOR: Record<Platform, string> = {
  adzuna:    '#f97316',
  vdab:      '#ff9f0a',
  jobat:     '#0a84ff',
  stepstone: '#bf5af2',
  ictjob:    '#30d158',
  indeed:    '#f43f5e',
};

const DEFAULT_TAGS = ['helpdesk', 'it support', 'servicedesk', 'applicatiebeheerder'];
const DEFAULT_PLATFORMS: Record<Platform, boolean> = {
  adzuna: true, vdab: false, jobat: false, stepstone: false, ictjob: false, indeed: false,
};

function ls<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch { return fallback; }
}

function getPlatformColor(line: string): string | null {
  const lower = line.toLowerCase();
  for (const [p, color] of Object.entries(PLATFORM_COLOR)) {
    if (lower.includes(p)) return color;
  }
  return null;
}

export default function Home() {
  const [loading, setLoading]   = useState(false);
  const [status, setStatus]     = useState('');
  const [progress, setProgress] = useState(0);
  const [showLog, setShowLog]   = useState(false);
  const [runLog, setRunLog]     = useState<{ text: string; color: string | null }[]>([]);
  const [copied, setCopied]     = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const logEndRef               = useRef<HTMLDivElement>(null);
  const [tags, setTagsRaw]      = useState<string[]>(DEFAULT_TAGS);
  const [tagInput, setTagInput] = useState('');
  const [platforms, setPlatformsRaw] = useState<Record<Platform, boolean>>(DEFAULT_PLATFORMS);
  const inputRef   = useRef<HTMLInputElement>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setTagsRaw(ls('ja_tags', DEFAULT_TAGS));
    setPlatformsRaw(ls(PLATFORMS_LS_KEY, DEFAULT_PLATFORMS));
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

  const setPlatforms = (fn: (prev: Record<Platform, boolean>) => Record<Platform, boolean>) => {
    setPlatformsRaw((prev) => {
      const next = fn(prev);
      try { localStorage.setItem(PLATFORMS_LS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const initialPlatformState = ALL_PLATFORMS.reduce((acc, p) => {
    acc[p] = { state: 'idle' };
    return acc;
  }, {} as Record<Platform, PlatformState>);

  const [platformState, setPlatformState] = useState<Record<Platform, PlatformState>>(initialPlatformState);

  // Only implemented platforms that the user has toggled on
  const selectedPlatforms = useMemo(
    () => IMPLEMENTED_PLATFORMS.filter((p) => platforms[p]),
    [platforms]
  );

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

  const log = (line: string) => {
    const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const color = getPlatformColor(line);
    setRunLog((prev) => [...prev, { text: `${t}  ${line}`, color }]);
  };

  const copyLogs = () => {
    navigator.clipboard.writeText(runLog.map(l => l.text).join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const resetRun = () => {
    setRunLog([]);
    setCopied(false);
    const next = { ...initialPlatformState };
    for (const p of IMPLEMENTED_PLATFORMS) {
      next[p] = { state: platforms[p] ? 'queued' : 'idle' };
    }
    setPlatformState(next);
  };

  const runPipeline = async () => {
    if (selectedPlatforms.length === 0) { setStatus('Select at least one platform.'); return; }
    if (tags.length === 0) { setStatus('Add at least one search tag.'); return; }
    resetRun();
    setShowLog(true);
    setLoading(true);
    setProgress(3);
    setStatus('Zoeken naar vacatures…');
    log(`Platforms: ${selectedPlatforms.join(', ')}`);
    log(`Tags: ${tags.join(', ')}`);

    try {
      for (let i = 0; i < selectedPlatforms.length; i++) {
        const platform     = selectedPlatforms[i];
        const baseProgress = 8 + Math.round((i / selectedPlatforms.length) * 60);
        const nextProgress = 8 + Math.round(((i + 1) / selectedPlatforms.length) * 60);

        setStatus(`Scraping ${platform}…`);
        setPlatformState((p) => ({ ...p, [platform]: { ...p[platform], state: 'running' } }));
        setProgress(baseProgress);

        const t0  = performance.now();
        const res = await fetch(
          `/api/scrape/stream?source=${platform}&tags=${encodeURIComponent(tags.join(','))}`,
          { method: 'POST' },
        );
        if (!res.body) throw new Error('No stream body');

        const reader   = res.body.getReader();
        const decoder  = new TextDecoder();
        let buffer      = '';
        let platformDone = false;

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
                setProgress((p) => Math.min(p + 1, nextProgress - 1));
              } else if (event.type === 'done') {
                const ms = Math.round(performance.now() - t0);
                setPlatformState((p) => ({ ...p, [platform]: { state: 'done', inserted: event.count, found: event.total_found, ms } }));
                log(`✓ ${platform} inserted=${event.count} found=${event.total_found} (${prettyMs(ms)})`);
                platformDone = true;
              } else if (event.type === 'error') {
                const ms = Math.round(performance.now() - t0);
                setPlatformState((p) => ({ ...p, [platform]: { state: 'error', ms, err: event.message } }));
                log(`✗ ${platform}: ${event.message}`);
                platformDone = true;
              }
            } catch {}
          }
        }

        if (!platformDone) {
          const ms = Math.round(performance.now() - t0);
          setPlatformState((p) => ({ ...p, [platform]: { state: 'error', ms, err: 'No response' } }));
          log(`✗ ${platform}: stream ended without result`);
        }
        setProgress(nextProgress);
      }

      setProgress(70);
      setStatus('Wachtrij aanmaken…');
      log('→ process');

      const p0  = performance.now();
      const pr  = await fetch('/api/process', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keywords: tags }) });
      const pMs = Math.round(performance.now() - p0);
      const pd  = await pr.json();

      if (!pr.ok) {
        const errMsg = pd.error || pd.message || `HTTP ${pr.status}`;
        setProgress(0); setStatus(`⚠️ ${errMsg}`); log(`✗ process: ${errMsg}`);
      } else if (pd.success) {
        setProgress(100);
        setStatus(`${pd.count || 0} jobs gevonden — bekijk ze snel!`);
        log(`✓ process queued=${pd.count || 0}${pd.failed ? ` (${pd.failed} mislukt)` : ''} (${prettyMs(pMs)})`);
      } else {
        setProgress(100); setStatus(pd.message || 'Niets nieuws gevonden.'); log(`✓ process: ${pd.message || 'niets nieuw'} (${prettyMs(pMs)})`);
      }
    } catch (err: any) {
      setProgress(0); setStatus(`Error: ${err.message}`); log(`ERROR: ${err.message}`);
    }

    setLoading(false);
  };

  const togglePlatform = (p: Platform) => setPlatforms((prev) => ({ ...prev, [p]: !prev[p] }));

  const stateDot = (s: PlatformState['state']) => {
    if (s === 'running') return 'var(--accent)';
    if (s === 'done')    return 'var(--green)';
    if (s === 'error')   return 'var(--red)';
    if (s === 'queued')  return 'var(--surface2)';
    return 'var(--border)';
  };

  if (!hydrated) return null;

  return (
    <main className="page-shell flex flex-col gap-6">

      {/* Header — greeting only, no duplicate title */}
      <motion.div
        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="flex flex-col gap-0.5"
      >
        <h1 className="text-4xl font-bold tracking-tight" style={{ color: 'var(--text)' }}>
          Hey{username ? `, ${username}` : ''} 👋
        </h1>
      </motion.div>

      {/* Sources */}
      <motion.div
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.07 }}
        className="rounded-2xl p-4 flex flex-col gap-3"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}
      >
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text2)' }}>Bronnen</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {ALL_PLATFORMS.map((p) => {
            const implemented = IMPLEMENTED_PLATFORMS.includes(p);
            const active      = implemented && platforms[p];
            const st          = platformState[p];
            const col         = PLATFORM_COLOR[p];
            return (
              <button
                key={p}
                onClick={() => implemented && togglePlatform(p)}
                className="flex flex-col items-center gap-1.5 py-3 rounded-xl transition-all active:scale-95"
                style={{
                  background:    active ? `${col}22` : 'var(--surface2)',
                  border:        `1.5px solid ${active ? col : 'transparent'}`,
                  opacity:       implemented ? 1 : 0.4,
                  pointerEvents: implemented ? 'auto' : 'none',
                  cursor:        implemented ? 'pointer' : 'default',
                }}
              >
                {implemented ? (
                  <span className="w-2 h-2 rounded-full" style={{ background: active ? stateDot(st.state) : 'var(--border)' }} />
                ) : (
                  <Lock className="w-3 h-3" style={{ color: 'var(--text2)' }} />
                )}
                <span className="text-[10px] font-semibold" style={{ color: active ? col : 'var(--text2)' }}>{p}</span>
                {implemented && st.state === 'done' && (
                  <span className="text-[9px]" style={{ color: 'var(--text2)' }}>{st.inserted ?? 0} new</span>
                )}
                {!implemented && (
                  <span className="text-[9px]" style={{ color: 'var(--text2)' }}>soon</span>
                )}
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Search tags */}
      <motion.div
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.14 }}
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
          placeholder="Geef een functie in…"
          className="bg-transparent text-sm outline-none w-full"
          style={{ color: 'var(--text)' }}
        />
      </motion.div>

      {/* Run button */}
      <motion.button
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.21 }}
        onClick={runPipeline}
        disabled={loading}
        className="w-full py-4 rounded-2xl text-base font-semibold transition-all active:scale-95 disabled:opacity-40"
        style={{ background: 'var(--accent)', color: '#fff' }}
      >
        {loading ? 'Gestart…' : 'Zoeken'}
      </motion.button>

      {/* Progress */}
      {(loading || progress > 0) && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="rounded-2xl px-4 py-4 flex flex-col gap-3"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <div className="flex justify-between text-xs" style={{ color: 'var(--text2)' }}>
            <span className="flex items-center gap-2">
              {loading && <Lottie animationData={loaderDots} loop autoplay style={{ width: 32, height: 20 }} />}
              {status || 'Ready'}
            </span>
            <span>{progress}%</span>
          </div>
          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface2)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%`, background: 'var(--accent)' }}
            />
          </div>
        </motion.div>
      )}

      {/* Logs */}
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
            className="rounded-xl p-3 text-xs max-h-48 overflow-auto font-mono flex flex-col gap-0.5"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            {runLog.length ? runLog.map((entry, i) => (
              <span key={i} style={{ color: entry.color ?? 'var(--text2)', opacity: entry.color ? 1 : 0.7 }}>
                {entry.text}
              </span>
            )) : <span style={{ color: 'var(--text2)' }}>—</span>}
            <div ref={logEndRef} />
          </div>
        )}
      </div>

      {/* Queue link */}
      <motion.div
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.28 }}
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
          <span className="text-xl group-hover:translate-x-1 transition-transform" style={{ color: 'var(--accent)' }}>→</span>
        </Link>
      </motion.div>

    </main>
  );
}
