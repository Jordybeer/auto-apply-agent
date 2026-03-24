"use client";

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import Lottie from 'lottie-react';
import loaderDots from './lotties/loader-dots.json';
import { ChevronDown, ChevronRight, X, Copy, Check } from 'lucide-react';

type Platform = 'jobat' | 'stepstone' | 'ictjob' | 'vdab' | 'indeed';
type PlatformState = {
  state: 'idle' | 'queued' | 'running' | 'done' | 'error';
  inserted?: number;
  found?: number;
  ms?: number;
  err?: string;
};

const prettyMs = (ms?: number) => {
  if (ms === undefined) return '';
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
};

const PLATFORM_COLOR: Record<Platform, string> = {
  jobat:     '#0a84ff',
  stepstone: '#bf5af2',
  ictjob:    '#30d158',
  vdab:      '#ff9f0a',
  indeed:    '#f43f5e',
};

const DEFAULT_TAGS = ['IT support', 'helpdesk', 'servicedesk', 'technician'];
const DEFAULT_PLATFORMS: Record<Platform, boolean> = { jobat: true, stepstone: true, ictjob: true, vdab: true, indeed: true };

function ls<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch { return fallback; }
}

export default function Home() {
  const [loading, setLoading]   = useState(false);
  const [status, setStatus]     = useState('');
  const [progress, setProgress] = useState(0);
  const [showLog, setShowLog]   = useState(false);
  const [runLog, setRunLog]     = useState<string[]>([]);
  const [copied, setCopied]     = useState(false);
  const logEndRef               = useRef<HTMLDivElement>(null);
  const [tags, setTagsRaw]      = useState<string[]>(DEFAULT_TAGS);
  const [tagInput, setTagInput] = useState('');
  const [platforms, setPlatformsRaw] = useState<Record<Platform, boolean>>(DEFAULT_PLATFORMS);
  const inputRef = useRef<HTMLInputElement>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setTagsRaw(ls('ja_tags', DEFAULT_TAGS));
    setPlatformsRaw(ls('ja_platforms', DEFAULT_PLATFORMS));
    setHydrated(true);
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
      try { localStorage.setItem('ja_platforms', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const [platformState, setPlatformState] = useState<Record<Platform, PlatformState>>({
    jobat: { state: 'idle' }, stepstone: { state: 'idle' }, ictjob: { state: 'idle' }, vdab: { state: 'idle' }, indeed: { state: 'idle' }
  });

  const selectedPlatforms = useMemo(
    () => (Object.keys(platforms) as Platform[]).filter((p) => platforms[p]),
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
    setRunLog((prev) => [...prev, `${t}  ${line}`]);
  };

  const copyLogs = () => {
    navigator.clipboard.writeText(runLog.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const resetRun = () => {
    setRunLog([]);
    setCopied(false);
    setPlatformState({
      jobat:     { state: platforms.jobat     ? 'queued' : 'idle' },
      stepstone: { state: platforms.stepstone ? 'queued' : 'idle' },
      ictjob:    { state: platforms.ictjob    ? 'queued' : 'idle' },
      vdab:      { state: platforms.vdab      ? 'queued' : 'idle' },
      indeed:    { state: platforms.indeed    ? 'queued' : 'idle' },
    });
  };

  const runPipeline = async () => {
    if (selectedPlatforms.length === 0) { setStatus('Select at least one platform.'); return; }
    if (tags.length === 0) { setStatus('Add at least one search tag.'); return; }
    resetRun();
    setShowLog(true);
    setLoading(true);
    setProgress(3);
    setStatus('Initialising…');
    log(`Platforms: ${selectedPlatforms.join(', ')}`);
    log(`Tags: ${tags.join(', ')}`);

    try {
      for (let i = 0; i < selectedPlatforms.length; i++) {
        const platform = selectedPlatforms[i];
        const baseProgress = 8 + Math.round((i / selectedPlatforms.length) * 60);
        const nextProgress  = 8 + Math.round(((i + 1) / selectedPlatforms.length) * 60);

        setStatus(`Scraping ${platform}…`);
        setPlatformState((p) => ({ ...p, [platform]: { ...p[platform], state: 'running' } }));
        setProgress(baseProgress);

        const t0 = performance.now();

        const res = await fetch(
          `/api/scrape/stream?source=${platform}&tags=${encodeURIComponent(tags.join(','))}`,
          { method: 'POST' }
        );

        if (!res.body) throw new Error('No stream body');

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
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
              } else if (event.type === 'platform_done') {
                const ms = Math.round(performance.now() - t0);
                setPlatformState((p) => ({ ...p, [platform]: { state: event.state, ms, err: event.err } }));
                platformDone = true;
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
      setStatus('Queueing jobs…');
      log('→ process');

      const p0  = performance.now();
      const pr  = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: tags }),
      });
      const pMs = Math.round(performance.now() - p0);

      if (!pr.ok) throw new Error(`Process failed ${pr.status}`);

      const pd = await pr.json();
      setProgress(100);

      if (pd.success) {
        setStatus(`${pd.count || 0} jobs queued — go review!`);
        log(`✓ process queued=${pd.count || 0} (${prettyMs(pMs)})`);
      } else {
        setStatus(pd.message || 'Nothing new to process.');
        log(`✓ process (${prettyMs(pMs)})`);
      }
    } catch (err: any) {
      setProgress(0);
      setStatus(`Error: ${err.message}`);
      log(`ERROR: ${err.message}`);
    }

    setLoading(false);
  };

  const togglePlatform = (p: Platform) => setPlatforms((prev) => ({ ...prev, [p]: !prev[p] }));

  const stateDot = (s: PlatformState['state']) => {
    if (s === 'running') return '#6366f1';
    if (s === 'done')    return '#6ee7b7';
    if (s === 'error')   return '#f87171';
    if (s === 'queued')  return '#3a3a45';
    return '#2a2a32';
  };

  if (!hydrated) return null;

  return (
    <main className="max-w-md mx-auto min-h-screen px-5 py-10 flex flex-col gap-6">

      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col gap-0.5"
      >
        <h1 className="text-4xl font-bold tracking-tight">🇧🇷 Brazil 2026</h1>
      </motion.div>

      {/* Sources */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.07, ease: 'easeOut' }}
        className="rounded-2xl p-4 flex flex-col gap-3"
        style={{ background: '#1a1a1f', border: '1px solid #2a2a32' }}
      >
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#6b6b7b' }}>Sources</p>
        <div className="grid grid-cols-5 gap-2">
          {(['jobat', 'stepstone', 'ictjob', 'vdab', 'indeed'] as Platform[]).map((p) => {
            const active = platforms[p];
            const st     = platformState[p];
            return (
              <button
                key={p}
                onClick={() => togglePlatform(p)}
                className="flex flex-col items-center gap-2 py-3 rounded-xl transition-all active:scale-95"
                style={{
                  background: active ? `${PLATFORM_COLOR[p]}22` : '#2a2a32',
                  border: `1.5px solid ${active ? PLATFORM_COLOR[p] : 'transparent'}`,
                  opacity: active ? 1 : 0.45,
                }}
              >
                <span className="w-2 h-2 rounded-full" style={{ background: stateDot(st.state) }} />
                <span className="text-[10px] font-semibold" style={{ color: active ? PLATFORM_COLOR[p] : '#6b6b7b' }}>{p}</span>
                {st.state === 'done' && <span className="text-[9px]" style={{ color: '#6b6b7b' }}>{st.inserted ?? 0} new</span>}
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Search tags */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.14, ease: 'easeOut' }}
        className="rounded-2xl p-4 flex flex-col gap-3 cursor-text"
        onClick={() => inputRef.current?.focus()}
        style={{ background: '#1a1a1f', border: '1px solid #2a2a32' }}
      >
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#6b6b7b' }}>Search tags</p>
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1.5 text-sm font-medium px-3 py-1 rounded-full"
              style={{ background: 'rgba(99,102,241,0.15)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.3)' }}
            >
              {tag}
              <button
                onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
                className="flex items-center justify-center w-4 h-4 rounded-full opacity-60 hover:opacity-100 transition-opacity"
                style={{ color: '#6366f1' }}
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
          placeholder="Add tag, press Enter…"
          className="bg-transparent text-sm outline-none w-full"
          style={{ color: '#ffffff' }}
        />
      </motion.div>

      {/* Run button */}
      <motion.button
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.21, ease: 'easeOut' }}
        onClick={runPipeline}
        disabled={loading}
        className="w-full py-4 rounded-2xl text-base font-semibold transition-all active:scale-95 disabled:opacity-40"
        style={{ background: '#6366f1', color: '#fff' }}
        onMouseEnter={e => (e.currentTarget.style.background = '#4f46e5')}
        onMouseLeave={e => (e.currentTarget.style.background = '#6366f1')}
      >
        {loading ? 'Running…' : 'Run Pipeline'}
      </motion.button>

      {/* Progress */}
      {(loading || progress > 0) && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-2xl px-4 py-4 flex flex-col gap-3"
          style={{ background: '#1a1a1f', border: '1px solid #2a2a32' }}
        >
          <div className="flex justify-between text-xs" style={{ color: '#6b6b7b' }}>
            <span className="flex items-center gap-2">
              {loading && <Lottie animationData={loaderDots} loop autoplay style={{ width: 32, height: 20 }} />}
              {status || 'Ready'}
            </span>
            <span>{progress}%</span>
          </div>
          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: '#2a2a32' }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, background: '#6366f1' }} />
          </div>
        </motion.div>
      )}

      {/* Logs */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => setShowLog((v) => !v)} className="flex items-center gap-1 text-xs" style={{ color: '#6b6b7b' }}>
            {showLog ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Live logs
          </button>
          {showLog && runLog.length > 0 && (
            <button
              onClick={copyLogs}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-all"
              style={{ color: copied ? '#6ee7b7' : '#6b6b7b', background: '#1a1a1f', border: '1px solid #2a2a32' }}
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          )}
        </div>
        {showLog && (
          <pre className="rounded-xl p-3 text-xs max-h-48 overflow-auto font-mono"
            style={{ background: '#1a1a1f', border: '1px solid #2a2a32', color: '#6b6b7b' }}>
            {runLog.length ? runLog.join('\n') : '—'}
            <div ref={logEndRef} />
          </pre>
        )}
      </div>

      {/* Queue link */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.28, ease: 'easeOut' }}
      >
        <Link href="/queue" className="rounded-2xl px-5 py-4 flex items-center justify-between group"
          style={{ background: '#1a1a1f', border: '1px solid #2a2a32' }}>
          <div>
            <p className="font-semibold text-white">Review Queue</p>
            <p className="text-sm" style={{ color: '#6b6b7b' }}>Swipe to review scraped jobs</p>
          </div>
          <span className="text-xl group-hover:translate-x-1 transition-transform" style={{ color: '#6366f1' }}>→</span>
        </Link>
      </motion.div>

    </main>
  );
}
