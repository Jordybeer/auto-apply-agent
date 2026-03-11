"use client";

import Link from 'next/link';
import { useMemo, useState } from 'react';
import Lottie from 'lottie-react';
import loaderDots from './lotties/loader-dots.json';
import { ChevronDown, ChevronRight, Shield, Sparkles } from 'lucide-react';

type Platform = 'jobat' | 'stepstone' | 'ictjob';

type PlatformState = {
  state: 'idle' | 'queued' | 'running' | 'done' | 'error';
  inserted?: number;
  found?: number;
  ms?: number;
  err?: string;
};

const prettyMs = (ms?: number) => {
  if (ms === undefined) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [showLog, setShowLog] = useState(false);

  const [runLog, setRunLog] = useState<string[]>([]);
  const [platformState, setPlatformState] = useState<Record<Platform, PlatformState>>({
    jobat: { state: 'idle' },
    stepstone: { state: 'idle' },
    ictjob: { state: 'idle' }
  });

  const [platforms, setPlatforms] = useState<Record<Platform, boolean>>({
    jobat: true,
    stepstone: true,
    ictjob: true
  });

  const selectedPlatforms = useMemo(
    () => (Object.keys(platforms) as Platform[]).filter((p) => platforms[p]),
    [platforms]
  );

  const log = (line: string) => {
    const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setRunLog((prev) => [...prev, `${t} ${line}`]);
  };

  const resetRun = () => {
    setRunLog([]);
    setPlatformState({
      jobat: { state: platforms.jobat ? 'queued' : 'idle' },
      stepstone: { state: platforms.stepstone ? 'queued' : 'idle' },
      ictjob: { state: platforms.ictjob ? 'queued' : 'idle' }
    });
  };

  const runPipeline = async () => {
    if (selectedPlatforms.length === 0) {
      setStatus('Error: Select at least one platform.');
      return;
    }

    resetRun();
    setShowLog(true);

    setLoading(true);
    setProgress(3);
    setStatus('Initializing scrape run...');

    log(`Selected platforms: ${selectedPlatforms.join(', ')}`);

    try {
      let totalInserted = 0;

      for (let i = 0; i < selectedPlatforms.length; i++) {
        const platform = selectedPlatforms[i];
        const pct = 8 + Math.round(((i + 1) / selectedPlatforms.length) * 52);

        setProgress(pct);
        setStatus(`Scraping ${platform}...`);

        setPlatformState((prev) => ({
          ...prev,
          [platform]: { ...prev[platform], state: 'running', err: undefined }
        }));

        log(`→ scrape:${platform} start`);

        const t0 = performance.now();
        const scrapeRes = await fetch(`/api/scrape?source=${platform}`, { method: 'POST' });
        const ms = Math.round(performance.now() - t0);

        if (!scrapeRes.ok) {
          const errText = await scrapeRes.text();
          setPlatformState((prev) => ({
            ...prev,
            [platform]: { ...prev[platform], state: 'error', ms, err: `HTTP ${scrapeRes.status}` }
          }));
          log(`✗ scrape:${platform} HTTP ${scrapeRes.status} (${prettyMs(ms)})`);
          throw new Error(
            `Server returned ${scrapeRes.status} while scraping ${platform}. (${errText.substring(0, 60)}...)`
          );
        }

        const scrapeData = await scrapeRes.json();
        if (!scrapeData.success) {
          setPlatformState((prev) => ({
            ...prev,
            [platform]: { ...prev[platform], state: 'error', ms, err: scrapeData.error || 'failed' }
          }));
          log(`✗ scrape:${platform} failed (${prettyMs(ms)})`);
          throw new Error(scrapeData.error || `Scraping failed for ${platform}`);
        }

        const inserted = scrapeData.count || 0;
        const found = typeof scrapeData.total_found === 'number' ? scrapeData.total_found : undefined;
        totalInserted += inserted;

        setPlatformState((prev) => ({
          ...prev,
          [platform]: { state: 'done', inserted, found, ms }
        }));

        log(`✓ scrape:${platform} inserted=${inserted}${found !== undefined ? ` found=${found}` : ''} (${prettyMs(ms)})`);
      }

      setProgress(65);
      log(`Scrape finished: inserted_total=${totalInserted}`);

      // Always run the LLM process step — even if 0 new jobs were inserted this run,
      // there may be unprocessed jobs already in the DB from a previous scrape.
      setStatus(
        totalInserted > 0
          ? `Scraped ${totalInserted} new jobs. Drafting applications...`
          : 'No new jobs this run. Checking for unprocessed jobs in DB...'
      );

      setProgress(78);
      setStatus('AI drafting personalized motivation letters & CV bullets...');
      log('→ process start');

      const p0 = performance.now();
      const processRes = await fetch('/api/process', { method: 'POST' });
      const pMs = Math.round(performance.now() - p0);

      if (!processRes.ok) {
        const errText = await processRes.text();
        log(`✗ process HTTP ${processRes.status} (${prettyMs(pMs)})`);
        throw new Error(`AI Processing failed with status ${processRes.status}. (${errText.substring(0, 60)}...)`);
      }

      const processData = await processRes.json();
      setProgress(100);

      if (!processData.success && processData.message) {
        setStatus(`Processing finished: ${processData.message}`);
        log(`✓ process finished (message) (${prettyMs(pMs)})`);
      } else if (!processData.success) {
        log(`✗ process failed (${prettyMs(pMs)})`);
        throw new Error(processData.error || 'AI Processing failed');
      } else {
        setStatus(`Drafted ${processData.count || 0} new applications. Queue ready!`);
        log(`✓ process drafted=${processData.count || 0} (${prettyMs(pMs)})`);
      }
    } catch (error: any) {
      setProgress(0);
      setStatus(`Error: ${error.message}`);
      log(`ERROR: ${error.message}`);
    }

    setLoading(false);
  };

  const togglePlatform = (p: Platform) => {
    setPlatforms((prev) => ({ ...prev, [p]: !prev[p] }));
  };

  const badge = (s: PlatformState['state']) => {
    if (s === 'running') return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30';
    if (s === 'done') return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    if (s === 'error') return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
    if (s === 'queued') return 'bg-zinc-500/15 text-zinc-200 border-zinc-500/30';
    return 'bg-zinc-800 text-zinc-300 border-zinc-700';
  };

  const runningAnimStyle = {
    width: 28,
    height: 28
  };

  return (
    <main className="max-w-5xl mx-auto p-8">
      <div className="flex items-start justify-between gap-6 mb-8">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 text-zinc-200 text-sm">
            <Shield className="h-4 w-4 opacity-80" />
            Antwerp IT support pipeline
          </div>
          <h1 className="text-4xl font-semibold tracking-tight mt-3">Job Application Agent</h1>
          <p className="text-zinc-400 mt-2 max-w-2xl">
            Scrape Jobat, StepStone & ictjob, score match fit, and draft tailored applications.
          </p>
        </div>
        <div className="hidden md:flex items-center gap-2 text-zinc-400 text-sm">
          <Sparkles className="h-4 w-4" />
          Modern UI + live logs
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="relative rounded-2xl p-[1px] bg-gradient-to-r from-fuchsia-500/50 via-cyan-400/50 to-blue-500/50 shadow-2xl">
          <div className="rounded-2xl bg-zinc-950/60 backdrop-blur border border-white/5 p-6 flex flex-col items-start w-full overflow-hidden">
            <div className="flex items-center justify-between w-full">
              <div>
                <h2 className="text-xl font-semibold">Pipeline Engine</h2>
                <p className="text-zinc-400 mt-1 text-sm">Pick sources, then run scrape + drafting.</p>
              </div>
              <div className="h-10 w-10 opacity-90" />
            </div>

            <div className="w-full mt-4 grid grid-cols-3 gap-2">
              {(['jobat', 'stepstone', 'ictjob'] as Platform[]).map((p) => {
                const st = platformState[p];
                return (
                  <div key={p} className="rounded-xl border border-white/5 bg-white/5 p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-zinc-200 capitalize">{p}</div>
                      <div className={`text-[11px] px-2 py-0.5 rounded-full border ${badge(st.state)}`}>
                        {st.state}
                      </div>
                    </div>
                    <div className="text-xs text-zinc-400 mt-2">
                      {st.state === 'done' && (
                        <span>
                          inserted {st.inserted ?? 0}
                          {typeof st.found === 'number' ? ` • found ${st.found}` : ''}
                          {st.ms ? ` • ${prettyMs(st.ms)}` : ''}
                        </span>
                      )}
                      {st.state === 'running' && <span>working…</span>}
                      {st.state === 'queued' && <span>queued</span>}
                      {st.state === 'error' && <span>error {st.err ? `(${st.err})` : ''}</span>}
                      {st.state === 'idle' && <span>off</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="w-full mt-4 rounded-xl border border-white/5 bg-black/20 p-3 text-sm">
              <div className="text-zinc-300 font-medium mb-2">Platforms</div>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-zinc-300">
                  <input
                    type="checkbox"
                    checked={platforms.jobat}
                    onChange={() => togglePlatform('jobat')}
                    className="accent-cyan-400"
                  />
                  Jobat
                </label>
                <label className="flex items-center gap-2 text-zinc-300">
                  <input
                    type="checkbox"
                    checked={platforms.stepstone}
                    onChange={() => togglePlatform('stepstone')}
                    className="accent-fuchsia-400"
                  />
                  StepStone
                </label>
                <label className="flex items-center gap-2 text-zinc-300">
                  <input
                    type="checkbox"
                    checked={platforms.ictjob}
                    onChange={() => togglePlatform('ictjob')}
                    className="accent-blue-400"
                  />
                  ictjob
                </label>
              </div>
            </div>

            <button
              onClick={runPipeline}
              disabled={loading}
              className="w-full mt-4 rounded-xl px-4 py-3 font-medium border border-white/10 bg-white/10 hover:bg-white/15 transition-colors disabled:opacity-50"
            >
              {loading ? 'Pipeline Running...' : 'Run Scraper & LLM'}
            </button>

            <div className="w-full mt-4">
              <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
                <span className="flex items-center gap-2">
                  Progress
                  {loading && (
                    <span className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
                      <span className="mr-1">running</span>
                      <Lottie animationData={loaderDots} loop autoplay style={runningAnimStyle} />
                    </span>
                  )}
                </span>
                <span>{progress}%</span>
              </div>

              <div className="w-full rounded-full h-3 bg-zinc-900/80 overflow-hidden border border-white/5 relative">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 via-fuchsia-500 to-cyan-400 transition-all duration-500 ease-out"
                  style={{ width: `${progress}%` }}
                />

                {loading && (
                  <div className="absolute inset-0 opacity-30 pointer-events-none">
                    <div className="absolute -left-16 top-0 h-full w-40 bg-white/30 blur-md animate-pulse" />
                  </div>
                )}

                {loading && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-80">
                    <Lottie animationData={loaderDots} loop autoplay style={{ width: 44, height: 18 }} />
                  </div>
                )}
              </div>
            </div>

            {status && (
              <div className="w-full mt-4 bg-black/30 border border-white/5 rounded-xl p-3 text-sm text-zinc-200 font-mono break-words">
                &gt; {status}
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowLog((v) => !v)}
              className="mt-4 text-xs text-zinc-300 hover:text-white flex items-center gap-2"
            >
              {showLog ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              Live logs
            </button>

            {showLog && (
              <pre className="w-full mt-2 max-h-56 overflow-auto text-xs text-zinc-300 bg-black/30 border border-white/5 rounded-xl p-3">
                {runLog.length ? runLog.join('\n') : '—'}
              </pre>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/5 bg-zinc-950/60 backdrop-blur p-6 flex flex-col items-start">
          <h2 className="text-xl font-semibold">Review Queue</h2>
          <p className="text-zinc-400 mt-1 text-sm flex-grow">
            Check pre-drafted cover letters and tailored resumes for high-match jobs. Approve, edit, or skip them.
          </p>
          <Link
            href="/queue"
            className="mt-4 rounded-xl bg-white text-black px-4 py-2 font-medium inline-flex items-center gap-2 hover:bg-zinc-100 transition-colors"
          >
            Open Queue
          </Link>
        </div>
      </div>
    </main>
  );
}
