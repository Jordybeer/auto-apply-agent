"use client";

import { useEffect, useRef, useState } from 'react';
import SwipeCard from '@/components/SwipeCard';
import Lottie from 'lottie-react';
import loaderDots from '@/app/lotties/loader-dots.json';
import Link from 'next/link';
import { SOURCE_COLOR_FLAT as SOURCE_COLORS } from '@/lib/constants';
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';

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
      color: ['#6ee7b7','#6366f1','#fbbf24','#f87171','#a78bfa'][Math.floor(Math.random() * 5)],
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
    <span className="tabular-nums transition-all duration-200" style={{
      display: 'inline-block',
      transform: bump ? 'scale(1.45)' : 'scale(1)',
      color: bump ? 'var(--accent)' : 'var(--text2)',
    }}>
      {display}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-all"
      style={{
        background: copied ? 'rgba(110,231,183,0.15)' : 'var(--surface2)',
        color: copied ? 'var(--green)' : 'var(--text2)',
        border: `1px solid ${copied ? 'rgba(110,231,183,0.3)' : 'var(--border)'}`,
      }}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function scoreColor(score: number) {
  if (score >= 75) return 'var(--green)';
  if (score >= 50) return '#ffd60a';
  return 'var(--red)';
}

function AIPanel({ app }: { app: any }) {
  const [open, setOpen] = useState(false);
  const hasContent = app.cover_letter_draft || (app.resume_bullets_draft?.length > 0);
  if (!hasContent) return null;

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="w-full flex items-center justify-between px-3 py-2.5 transition-colors"
        style={{ background: open ? 'var(--surface2)' : 'var(--surface)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: '#a78bfa' }}>🤖 AI Draft</span>
          {typeof app.match_score === 'number' && app.match_score > 0 && (
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full tabular-nums"
              style={{
                background: `${scoreColor(app.match_score)}18`,
                color: scoreColor(app.match_score),
                border: `1px solid ${scoreColor(app.match_score)}44`,
              }}
            >
              {app.match_score}%
            </span>
          )}
        </div>
        {open
          ? <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--text2)' }} />
          : <ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--text2)' }} />}
      </button>

      {open && (
        <div className="flex flex-col gap-0" style={{ borderTop: '1px solid var(--border)' }}>
          {app.reasoning && (
            <div className="px-3 py-2.5" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
              <p className="text-xs leading-relaxed" style={{ color: '#a78bfa' }}>{app.reasoning}</p>
            </div>
          )}
          {app.cover_letter_draft && (
            <div className="flex flex-col gap-2 px-3 py-3" style={{ borderBottom: app.resume_bullets_draft?.length > 0 ? '1px solid var(--border)' : 'none', background: 'var(--surface)' }}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text2)' }}>Motivatiebrief</span>
                <CopyButton text={app.cover_letter_draft} />
              </div>
              <p className="text-xs leading-relaxed whitespace-pre-line" style={{ color: 'var(--text3)' }}>
                {app.cover_letter_draft}
              </p>
            </div>
          )}
          {app.resume_bullets_draft?.length > 0 && (
            <div className="flex flex-col gap-2 px-3 py-3" style={{ background: 'var(--surface)' }}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text2)' }}>CV Bullets</span>
                <CopyButton text={app.resume_bullets_draft.join('\n')} />
              </div>
              <ul className="flex flex-col gap-1.5">
                {app.resume_bullets_draft.map((bullet: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-xs leading-relaxed" style={{ color: 'var(--text3)' }}>
                    <span className="mt-0.5 flex-shrink-0" style={{ color: 'var(--accent)' }}>▸</span>
                    {bullet}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type Tab = 'results' | 'saved' | 'applied';
const DEFAULT_TAGS = ['IT support', 'helpdesk', 'servicedesk', 'technician'];

function ls<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch { return fallback; }
}

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
  const [activeKeywords, setActiveKeywords] = useState<string[]>(DEFAULT_TAGS);
  const [dragX, setDragX]               = useState(0);

  const hasFetchedSaved   = useRef(false);
  const hasFetchedApplied = useRef(false);

  useEffect(() => {
    setActiveKeywords(ls('ja_tags', DEFAULT_TAGS));
    fetchQueue();
  }, []);

  useEffect(() => {
    if (tab === 'saved' && !hasFetchedSaved.current) {
      hasFetchedSaved.current = true;
      fetchSaved();
    }
    if (tab === 'applied' && !hasFetchedApplied.current) {
      hasFetchedApplied.current = true;
      fetchApplied();
    }
  }, [tab]);

  const fetchQueue = async () => {
    try {
      const res = await fetch('/api/queue');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.applications) setApplications(json.applications);
    } catch (e) {
      console.error('fetchQueue failed', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchSaved = async () => {
    setSavedLoading(true);
    try {
      const res = await fetch('/api/saved');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.applications) setSaved(json.applications);
    } catch (e) {
      console.error('fetchSaved failed', e);
    } finally {
      setSavedLoading(false);
    }
  };

  const fetchApplied = async () => {
    setAppliedLoading(true);
    try {
      const res = await fetch('/api/applied');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.applications) setApplied(json.applications);
    } catch (e) {
      console.error('fetchApplied failed', e);
    } finally {
      setAppliedLoading(false);
    }
  };

  const advance = () => setTopIdx((i) => i + 1);

  const handleSwipeLeft = async (id: string) => {
    setRedFlash(true);
    setDragX(0);
    setTimeout(() => setRedFlash(false), 400);
    await fetch('/api/queue', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: 'skipped' }) });
    advance();
  };

  const handleSwipeRight = async (id: string) => {
    setDragX(0);
    const item = applications.find((a) => a.id === id);
    if (item) setSaved((prev) => [{ ...item, status: 'saved' }, ...prev]);
    await fetch('/api/queue', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: 'saved' }) });
    advance();
  };

  const markApplied = async (id: string) => {
    setConfetti((c) => c + 1);
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
      style={{ background: redFlash ? 'rgba(248,113,113,0.06)' : 'var(--bg)' }}
    >
      <Confetti trigger={confetti} />

      <div className="flex items-center justify-between mb-4">
        <Link href="/" className="text-sm font-medium" style={{ color: 'var(--accent)' }}>← Back</Link>
        {tab === 'results' && (
          <span className="text-sm">
            <AnimatedCount value={remaining} />
            <span style={{ color: 'var(--text2)' }}> left</span>
          </span>
        )}
      </div>

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

      {tab === 'results' && (
        loading ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-4 mt-20">
            <Lottie animationData={loaderDots} loop autoplay style={{ width: 64, height: 32 }} />
            <p className="text-sm" style={{ color: 'var(--text2)' }}>Loading queue…</p>
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
                  <SwipeCard
                    application={app}
                    onSwipeLeft={handleSwipeLeft}
                    onSwipeRight={handleSwipeRight}
                    isTop={i === 0}
                    activeKeywords={activeKeywords}
                    onDragX={i === 0 ? setDragX : undefined}
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between mt-5 px-1">
              <div
                className="flex items-center gap-1.5 text-sm font-semibold px-5 py-2.5 rounded-full transition-all duration-150"
                style={{
                  background: dragX < -40 ? 'rgba(248,113,113,0.15)' : 'var(--surface)',
                  color: dragX < -40 ? 'var(--red)' : 'var(--surface2)',
                  border: `1px solid ${dragX < -40 ? 'rgba(248,113,113,0.35)' : 'var(--border)'}`,
                  transform: dragX < -40 ? 'scale(1.05)' : 'scale(1)',
                }}
              >
                ← skip
              </div>
              <span className="text-xs" style={{ color: 'var(--border)' }}>swipe to decide</span>
              <div
                className="flex items-center gap-1.5 text-sm font-semibold px-5 py-2.5 rounded-full transition-all duration-150"
                style={{
                  background: dragX > 40 ? 'rgba(110,231,183,0.15)' : 'var(--surface)',
                  color: dragX > 40 ? 'var(--green)' : 'var(--surface2)',
                  border: `1px solid ${dragX > 40 ? 'rgba(110,231,183,0.35)' : 'var(--border)'}`,
                  transform: dragX > 40 ? 'scale(1.05)' : 'scale(1)',
                }}
              >
                save →
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center mt-20">
            <div className="w-20 h-20 rounded-full flex items-center justify-center text-4xl" style={{ background: 'var(--surface)' }}>✓</div>
            <h2 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>All caught up</h2>
            <p className="text-sm" style={{ color: 'var(--text2)' }}>No more jobs in the queue.</p>
            <Link href="/" className="mt-4 px-6 py-3 rounded-2xl text-sm font-semibold text-white" style={{ background: 'var(--accent)' }}>
              Run pipeline again
            </Link>
          </div>
        )
      )}

      {tab === 'saved' && (
        savedLoading ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-4 mt-20">
            <Lottie animationData={loaderDots} loop autoplay style={{ width: 64, height: 32 }} />
            <p className="text-sm" style={{ color: 'var(--text2)' }}>Loading…</p>
          </div>
        ) : saved.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center mt-20">
            <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl" style={{ background: 'var(--surface)' }}>🔖</div>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Nothing saved yet</h2>
            <p className="text-sm" style={{ color: 'var(--text2)' }}>Swipe right to save jobs here.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 pb-8">
            {saved.map((app) => {
              const job = app.jobs;
              const src = job?.source || '';
              const col = SOURCE_COLORS[src] || 'var(--text2)';
              return (
                <div key={app.id} className="rounded-2xl p-4 flex flex-col gap-3"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: `${col}22`, color: col }}>{src || '?'}</span>
                      <span className="text-xs truncate" style={{ color: 'var(--text2)' }}>{job?.company || ''}</span>
                    </div>
                    <button onClick={() => removeFromSaved(app.id)}
                      className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full opacity-40 hover:opacity-80 transition-opacity"
                      style={{ color: 'var(--text2)' }}>✕</button>
                  </div>
                  <p className="font-semibold text-base leading-snug" style={{ color: 'var(--text)' }}>{job?.title || 'Unknown'}</p>
                  <AIPanel app={app} />
                  <div className="flex gap-2">
                    {job?.url && (
                      <a href={job.url} target="_blank" rel="noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium py-2.5 rounded-xl transition-opacity active:opacity-60"
                        style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--accent)' }}>
                        Open ↗
                      </a>
                    )}
                    <button onClick={() => markApplied(app.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium py-2.5 rounded-xl transition-opacity active:opacity-60"
                      style={{ background: 'rgba(110,231,183,0.12)', color: 'var(--green)' }}>
                      ✓ Applied
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {tab === 'applied' && (
        appliedLoading ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-4 mt-20">
            <Lottie animationData={loaderDots} loop autoplay style={{ width: 64, height: 32 }} />
            <p className="text-sm" style={{ color: 'var(--text2)' }}>Loading…</p>
          </div>
        ) : applied.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center mt-20">
            <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl" style={{ background: 'var(--surface)' }}>📋</div>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>No applications yet</h2>
            <p className="text-sm" style={{ color: 'var(--text2)' }}>Hit "✓ Applied" on saved jobs to track them here.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 pb-8">
            {applied.map((app) => {
              const job = app.jobs;
              const src = job?.source || '';
              const col = SOURCE_COLORS[src] || 'var(--text2)';
              return (
                <div key={app.id} className="rounded-2xl p-4 flex flex-col gap-2"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full flex-shrink-0"
                      style={{ background: `${col}22`, color: col }}>{src || '?'}</span>
                    <span className="text-xs truncate" style={{ color: 'var(--text2)' }}>{job?.company || ''}</span>
                  </div>
                  <p className="font-semibold text-base leading-snug" style={{ color: 'var(--text)' }}>{job?.title || 'Unknown'}</p>
                  {job?.url && (
                    <a href={job.url} target="_blank" rel="noreferrer"
                      className="mt-1 flex items-center gap-1.5 text-sm font-medium self-start px-3 py-1.5 rounded-xl transition-opacity active:opacity-60"
                      style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--accent)' }}>
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
