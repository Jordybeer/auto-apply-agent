"use client";

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import Lottie from 'lottie-react';
import loaderDots from './lotties/loader-dots.json';
import { ChevronDown, ChevronRight, X } from 'lucide-react';

type Platform = 'jobat' | 'stepstone' | 'ictjob' | 'vdab';
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
};

const DEFAULT_TAGS = ['IT support', 'helpdesk', 'servicedesk', 'technician'];

export default function Home() {
  const [loading, setLoading]   = useState(false);
  const [status, setStatus]     = useState('');
  const [progress, setProgress] = useState(0);
  const [showLog, setShowLog]   = useState(false);
  const [runLog, setRunLog]     = useState<string[]>([]);
  const [tags, setTags]         = useState<string[]>(DEFAULT_TAGS);
  const [tagInput, setTagInput] = useState('');
  const inputRef                = useRef<HTMLInputElement>(null);

  const [platformState, setPlatformState] = useState<Record<Platform, PlatformState>>({
    jobat: { state: 'idle' }, stepstone: { state: 'idle' }, ictjob: { state: 'idle' }, vdab: { state: 'idle' }
  });
  const [platforms, setPlatforms] = useState<Record<Platform, boolean>>({
    jobat: true, stepstone: true, ictjob: true, vdab: true
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

  const resetRun = () => {
    setRunLog([]);
    setPlatformState({
      jobat:     { state: platforms.jobat     ? 'queued' : 'idle' },
      stepstone: { state: platforms.stepstone ? 'queued' : 'idle' },
      ictjob:    { state: platforms.ictjob    ? 'queued' : 'idle' },
      vdab:      { state: platforms.vdab      ? 'queued' : 'idle' },
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
      let totalInserted = 0;

      for (let i = 0; i < selectedPlatforms.length; i++) {
        const platform = selectedPlatforms[i];
        setProgress(8 + Math.round(((i + 1) / selectedPlatforms.length) * 52));
        setStatus(`Scraping ${platform}…`);
        setPlatformState((p) => ({ ...p, [platform]: { ...p[platform], state: 'running' } }));
        log(`→ scrape:${platform}`);

        const t0  = performance.now();
        const res = await fetch(
          `/api/scrape?source=${platform}&tags=${encodeURIComponent(tags.join(','))}`,
          { method: 'POST' }
        );
        const ms  = Math.round(performance.now() - t0);

        if (!res.ok) {
          setPlatformState((p) => ({ ...p, [platform]: { state: 'error', ms, err: `HTTP ${res.status}` } }));
          log(`✗ ${platform} HTTP ${res.status} (${prettyMs(ms)})`);
          throw new Error(`${platform} scrape failed ${res.status}`);
        }

        const d = await res.json();
        if (!d.success) {
          setPlatformState((p) => ({ ...p, [platform]: { state: 'error', ms, err: d.error || 'failed' } }));
          throw new Error(d.error || `${platform} scrape failed`);
        }

        totalInserted += d.count || 0;
        setPlatformState((p) => ({ ...p, [platform]: { state: 'done', inserted: d.count || 0, found: d.total_found, ms } }));
        log(`✓ ${platform} inserted=${d.count || 0} (${prettyMs(ms)})`);
      }

      setProgress(70);
      setStatus('Queueing jobs…');
      log('→ process');

      const p0  = performance.now();
      const pr  = await fetch('/api/process', { method: 'POST' });
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
    if (s === 'running') return '#0a84ff';
    if (s === 'done')    return '#30d158';
    if (s === 'error')   return '#ff453a';
    if (s === 'queued')  return '#636366';
    return '#3a3a3c';
  };

  return (
    <main className="max-w-md mx-auto min-h-screen px-5 py-10 flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold tracking-widest uppercase text-[var(--text2)]">Antwerp · IT Support</p>
        <h1 className="text-4xl font-bold tracking-tight">Job Agent</h1>
        <p className="text-[var(--text2)] text-sm mt-1">Scrape · queue · review</p>
      </div>

      {/* Sources */}
      <div className="glass rounded-2xl p-4 flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text2)]">Sources</p>
        <div className="grid grid-cols-4 gap-2">
          {(['jobat', 'stepstone', 'ictjob', 'vdab'] as Platform[]).map((p) => {
            const active = platforms[p];
            const st     = platformState[p];
            return (
              <button
                key={p}
                onClick={() => togglePlatform(p)}
                className="flex flex-col items-center gap-2 py-3 rounded-xl transition-all active:scale-95"
                style={{
                  background: active ? `${PLATFORM_COLOR[p]}22` : 'rgba(255,255,255,0.04)',
                  border: `1.5px solid ${active ? PLATFORM_COLOR[p] : 'transparent'}`,
                  opacity: active ? 1 : 0.45,
                }}
              >
                <span className="w-2 h-2 rounded-full" style={{ background: stateDot(st.state) }} />
                <span className="text-xs font-semibold" style={{ color: active ? PLATFORM_COLOR[p] : 'var(--text2)' }}>
                  {p}
                </span>
                {st.state === 'done' && (
                  <span className="text-[10px] text-[var(--text2)]">{st.inserted ?? 0} new</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Search tags */}
      <div
        className="glass rounded-2xl p-4 flex flex-col gap-3 cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text2)]">Search tags</p>
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1.5 text-sm font-medium px-3 py-1 rounded-full"
              style={{ background: 'rgba(10,132,255,0.15)', color: '#0a84ff', border: '1px solid rgba(10,132,255,0.3)' }}
            >
              {tag}
              <button
                onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
                className="flex items-center justify-center w-4 h-4 rounded-full opacity-60 hover:opacity-100 transition-opacity"
                style={{ color: '#0a84ff' }}
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
          className="bg-transparent text-sm outline-none placeholder:text-[var(--text2)] w-full"
          style={{ color: 'var(--text)' }}
        />
      </div>

      {/* Run */}
      <button
        onClick={runPipeline}
        disabled={loading}
        className="w-full py-4 rounded-2xl text-base font-semibold transition-all active:scale-95 disabled:opacity-40"
        style={{ background: 'var(--accent)', color: '#fff' }}
      >
        {loading ? 'Running…' : 'Run Pipeline'}
      </button>

      {(loading || progress > 0) && (
        <div className="glass rounded-2xl px-4 py-4 flex flex-col gap-3">
          <div className="flex justify-between text-xs text-[var(--text2)]">
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
        </div>
      )}

      <div>
        <button
          onClick={() => setShowLog((v) => !v)}
          className="flex items-center gap-1 text-xs text-[var(--text2)] mb-2"
        >
          {showLog ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          Live logs
        </button>
        {showLog && (
          <pre className="glass rounded-xl p-3 text-xs text-[var(--text2)] max-h-48 overflow-auto font-mono">
            {runLog.length ? runLog.join('\n') : '—'}
          </pre>
        )}
      </div>

      <Link href="/queue" className="glass rounded-2xl px-5 py-4 flex items-center justify-between group">
        <div>
          <p className="font-semibold">Review Queue</p>
          <p className="text-[var(--text2)] text-sm">Swipe to review scraped jobs</p>
        </div>
        <span className="text-[var(--accent)] text-xl group-hover:translate-x-1 transition-transform">→</span>
      </Link>
    </main>
  );
}
