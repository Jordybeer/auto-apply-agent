"use client";

import { useEffect, useRef, useState } from 'react';
import SwipeCard from '@/components/SwipeCard';
import Lottie from 'lottie-react';
import loaderDots from '@/app/lotties/loader-dots.json';
import Link from 'next/link';

function Confetti({ trigger }: { trigger: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!trigger) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const particles = Array.from({ length: 80 }, () => ({
      x: canvas.width / 2, y: canvas.height * 0.45,
      vx: (Math.random() - 0.5) * 18, vy: (Math.random() - 1.2) * 14,
      color: ['#30d158','#0a84ff','#ffd60a','#bf5af2','#ff9f0a'][Math.floor(Math.random() * 5)],
      size: Math.random() * 8 + 4, rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 8, alpha: 1,
    }));
    let frame: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      for (const p of particles) {
        p.x += p.vx; p.vy += 0.55; p.y += p.vy;
        p.rotation += p.rotSpeed; p.alpha -= 0.018;
        if (p.alpha <= 0) continue;
        alive = true;
        ctx.save(); ctx.globalAlpha = p.alpha;
        ctx.translate(p.x, p.y); ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.5);
        ctx.restore();
      }
      if (alive) frame = requestAnimationFrame(animate);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [trigger]);
  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-50" />;
}

function AnimatedCount({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const [bump, setBump] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (value === prev.current) return;
    setBump(true);
    const t = setTimeout(() => { setDisplay(value); setBump(false); prev.current = value; }, 180);
    return () => clearTimeout(t);
  }, [value]);
  return (
    <span className="tabular-nums transition-all duration-200" style={{ display: 'inline-block', transform: bump ? 'scale(1.45)' : 'scale(1)', color: bump ? 'var(--accent)' : 'var(--text2)' }}>
      {display}
    </span>
  );
}

type Tab = 'results' | 'saved' | 'applied';

const SOURCE_COLORS: Record<string, string> = {
  jobat: '#0a84ff', stepstone: '#bf5af2', ictjob: '#30d158', vdab: '#ff9f0a',
};

export default function QueuePage() {
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading]           = useState(true);
  const [topIdx, setTopIdx]             = useState(0);
  const [confetti, setConfetti]         = useState(0);
  const [redFlash, setRedFlash]         = useState(false);
  const [tab, setTab]                   = useState<Tab>('results');
  const [saved, setSaved]               = useState<any[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [applied, setApplied]           = useState<any[]>([]);
  const [appliedLoading, setAppliedLoading] = useState(false);

  useEffect(() => { fetchQueue(); }, []);

  // Always re-fetch when switching tabs
  useEffect(() => {
    if (tab === 'saved')   fetchSaved();
    if (tab === 'applied') fetchApplied();
  }, [tab]);

  const fetchQueue = async () => {
    const res  = await fetch('/api/queue');
    const json = await res.json();
    if (json.applications) setApplications(json.applications);
    setLoading(false);
  };

  const fetchSaved = async () => {
    setSavedLoading(true);
    const res  = await fetch('/api/saved');
    const json = await res.json();
    if (json.applications) setSaved(json.applications);
    setSavedLoading(false);
  };

  const fetchApplied = async () => {
    setAppliedLoading(true);
    const res  = await fetch('/api/applied');
    const json = await res.json();
    if (json.applications) setApplied(json.applications);
    setAppliedLoading(false);
  };

  const advance = () => setTopIdx((i) => i + 1);

  const handleSwipeLeft = async (id: string) => {
    setRedFlash(true);
    setTimeout(() => setRedFlash(false), 400);
    await fetch('/api/queue', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: 'skipped' }) });
    advance();
  };

  const handleSwipeRight = async (id: string) => {
    setConfetti((c) => c + 1);
    // Optimistically add to saved list
    const item = applications.find((a) => a.id === id);
    if (item) setSaved((prev) => [{ ...item, status: 'saved' }, ...prev]);
    await fetch('/api/queue', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: 'saved' }) });
    advance();
  };

  const markApplied = async (id: string) => {
    await fetch('/api/queue', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: 'applied' }) });
    const item = saved.find((a) => a.id === id);
    setSaved((prev) => prev.filter((a) => a.id !== id));
    if (item) setApplied((prev) => [{ ...item, status: 'applied' }, ...prev]);
  };

  const removeFromSaved = async (id: string) => {
    await fetch('/api/queue', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: 'skipped' }) });
    setSaved((prev) => prev.filter((a) => a.id !== id));
  };

  const visible   = applications.slice(topIdx, topIdx + 3);
  const remaining = applications.length - topIdx;

  const tabs: { key: Tab; label: (count: number) => string }[] = [
    { key: 'results', label: (n) => n > 0 ? `Results (${n})` : 'Results' },
    { key: 'saved',   label: (n) => n > 0 ? `Saved (${n})` : 'Saved' },
    { key: 'applied', label: (n) => n > 0 ? `Applied (${n})` : 'Applied' },
  ];
  const tabCounts: Record<Tab, number> = { results: remaining, saved: saved.length, applied: applied.length };

  return (
    <div
      className="flex flex-col min-h-screen max-w-md mx-auto px-4 py-8 select-none transition-colors duration-300"
      style={{ background: redFlash ? 'rgba(255,69,58,0.08)' : 'transparent' }}
    >
      <Confetti trigger={confetti} />

      {/* Top bar */}
      <div className="flex items-center justify-between mb-4">
        <Link href="/" className="text-[var(--accent)] text-sm font-medium">← Back</Link>
        {tab === 'results' && (
          <span className="text-sm">
            <AnimatedCount value={remaining} />
            <span className="text-[var(--text2)]"> left</span>
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 p-1 rounded-2xl" style={{ background: 'var(--surface)' }}>
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200"
            style={{
              background: tab === key ? 'var(--surface2)' : 'transparent',
              color: tab === key ? 'var(--text)' : 'var(--text2)',
              boxShadow: tab === key ? '0 1px 4px rgba(0,0,0,0.3)' : 'none',
            }}
          >
            {label(tabCounts[key])}
          </button>
        ))}
      </div>

      {/* Results tab */}
      {tab === 'results' && (
        loading ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-4 mt-20">
            <Lottie animationData={loaderDots} loop autoplay style={{ width: 64, height: 32 }} />
            <p className="text-[var(--text2)] text-sm">Loading queue…</p>
          </div>
        ) : remaining > 0 ? (
          <>
            <div className="relative w-full overflow-hidden rounded-3xl" style={{ height: '62vh' }}>
              {visible.map((app, i) => (
                <div
                  key={app.id}
                  className="absolute inset-0"
                  style={{
                    transform: `scale(${1 - i * 0.04}) translateY(${i * 14}px)`,
                    zIndex: visible.length - i,
                    transition: 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1)',
                    pointerEvents: i === 0 ? 'auto' : 'none',
                  }}
                >
                  <SwipeCard application={app} onSwipeLeft={handleSwipeLeft} onSwipeRight={handleSwipeRight} isTop={i === 0} />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-center gap-10 mt-6">
              <button
                onClick={() => handleSwipeLeft(visible[0]?.id)}
                className="w-16 h-16 rounded-full flex items-center justify-center text-2xl shadow-lg transition-all duration-150 active:scale-75"
                style={{ background: 'rgba(255,69,58,0.15)', border: '1.5px solid var(--red)', color: 'var(--red)' }}
              >✕</button>
              <button
                onClick={() => handleSwipeRight(visible[0]?.id)}
                className="w-16 h-16 rounded-full flex items-center justify-center text-2xl shadow-lg transition-all duration-150 active:scale-75"
                style={{ background: 'rgba(48,209,88,0.15)', border: '1.5px solid var(--green)', color: 'var(--green)' }}
              >✓</button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center mt-20">
            <div className="w-20 h-20 rounded-full flex items-center justify-center text-4xl" style={{ background: 'var(--surface)' }}>✓</div>
            <h2 className="text-xl font-semibold">All caught up</h2>
            <p className="text-[var(--text2)] text-sm">No more jobs in the queue.</p>
            <Link href="/" className="mt-4 px-6 py-3 rounded-2xl text-sm font-semibold" style={{ background: 'var(--accent)', color: '#fff' }}>
              Run pipeline again
            </Link>
          </div>
        )
      )}

      {/* Saved tab */}
      {tab === 'saved' && (
        savedLoading ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-4 mt-20">
            <Lottie animationData={loaderDots} loop autoplay style={{ width: 64, height: 32 }} />
            <p className="text-[var(--text2)] text-sm">Loading…</p>
          </div>
        ) : saved.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center mt-20">
            <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl" style={{ background: 'var(--surface)' }}>🔖</div>
            <h2 className="text-lg font-semibold">Nothing saved yet</h2>
            <p className="text-[var(--text2)] text-sm">Swipe right to save jobs here.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 pb-8">
            {saved.map((app) => {
              const job = app.jobs;
              const src = job?.source || '';
              const col = SOURCE_COLORS[src] || '#aeaeb2';
              return (
                <div
                  key={app.id}
                  className="rounded-2xl p-4 flex flex-col gap-2"
                  style={{ background: 'var(--surface)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full flex-shrink-0" style={{ background: `${col}22`, color: col }}>{src || '?'}</span>
                      <span className="text-xs truncate" style={{ color: 'var(--text2)' }}>{job?.company || ''}</span>
                    </div>
                    <button
                      onClick={() => removeFromSaved(app.id)}
                      className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full opacity-40 hover:opacity-80 transition-opacity"
                      style={{ color: 'var(--text2)' }}
                    >
                      ✕
                    </button>
                  </div>
                  <p className="font-semibold text-base leading-snug">{job?.title || 'Unknown'}</p>
                  <div className="flex gap-2 mt-1">
                    {job?.url && (
                      <a
                        href={job.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium py-2 rounded-xl transition-opacity active:opacity-60"
                        style={{ background: 'rgba(10,132,255,0.12)', color: '#0a84ff' }}
                      >
                        Open ↗
                      </a>
                    )}
                    <button
                      onClick={() => markApplied(app.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium py-2 rounded-xl transition-opacity active:opacity-60"
                      style={{ background: 'rgba(48,209,88,0.12)', color: 'var(--green)' }}
                    >
                      ✓ Applied
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Applied tab */}
      {tab === 'applied' && (
        appliedLoading ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-4 mt-20">
            <Lottie animationData={loaderDots} loop autoplay style={{ width: 64, height: 32 }} />
            <p className="text-[var(--text2)] text-sm">Loading…</p>
          </div>
        ) : applied.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center mt-20">
            <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl" style={{ background: 'var(--surface)' }}>📋</div>
            <h2 className="text-lg font-semibold">No applications yet</h2>
            <p className="text-[var(--text2)] text-sm">Hit "✓ Applied" on saved jobs to track them here.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 pb-8">
            {applied.map((app) => {
              const job = app.jobs;
              const src = job?.source || '';
              const col = SOURCE_COLORS[src] || '#aeaeb2';
              return (
                <div
                  key={app.id}
                  className="rounded-2xl p-4 flex flex-col gap-2"
                  style={{ background: 'var(--surface)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full flex-shrink-0" style={{ background: `${col}22`, color: col }}>{src || '?'}</span>
                    <span className="text-xs truncate" style={{ color: 'var(--text2)' }}>{job?.company || ''}</span>
                  </div>
                  <p className="font-semibold text-base leading-snug">{job?.title || 'Unknown'}</p>
                  {job?.url && (
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 flex items-center gap-1.5 text-sm font-medium self-start px-3 py-1.5 rounded-xl transition-opacity active:opacity-60"
                      style={{ background: 'rgba(10,132,255,0.12)', color: '#0a84ff' }}
                    >
                      Open ↗
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
