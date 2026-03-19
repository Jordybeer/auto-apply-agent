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
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = Array.from({ length: 80 }, () => ({
      x: canvas.width / 2,
      y: canvas.height * 0.45,
      vx: (Math.random() - 0.5) * 18,
      vy: (Math.random() - 1.2) * 14,
      color: ['#30d158','#0a84ff','#ffd60a','#bf5af2','#ff9f0a'][Math.floor(Math.random() * 5)],
      size: Math.random() * 8 + 4,
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 8,
      alpha: 1,
    }));

    let frame: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      for (const p of particles) {
        p.x  += p.vx;
        p.vy += 0.55;
        p.y  += p.vy;
        p.rotation += p.rotSpeed;
        p.alpha    -= 0.018;
        if (p.alpha <= 0) continue;
        alive = true;
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
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
  const [bump, setBump]       = useState(false);
  const prev                  = useRef(value);

  useEffect(() => {
    if (value === prev.current) return;
    setBump(true);
    const t = setTimeout(() => { setDisplay(value); setBump(false); prev.current = value; }, 180);
    return () => clearTimeout(t);
  }, [value]);

  return (
    <span
      className="tabular-nums transition-all duration-200"
      style={{
        display: 'inline-block',
        transform: bump ? 'scale(1.45)' : 'scale(1)',
        color: bump ? 'var(--accent)' : 'var(--text2)',
      }}
    >
      {display}
    </span>
  );
}

export default function QueuePage() {
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading]           = useState(true);
  const [topIdx, setTopIdx]             = useState(0);
  const [confetti, setConfetti]         = useState(0);
  const [redFlash, setRedFlash]         = useState(false);

  useEffect(() => { fetchQueue(); }, []);

  const fetchQueue = async () => {
    const res  = await fetch('/api/queue');
    const json = await res.json();
    if (json.applications) setApplications(json.applications);
    setLoading(false);
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
    await fetch('/api/queue', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: 'applied' }) });
    advance();
  };

  const visible   = applications.slice(topIdx, topIdx + 3);
  const remaining = applications.length - topIdx;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <Lottie animationData={loaderDots} loop autoplay style={{ width: 64, height: 32 }} />
        <p className="text-[var(--text2)] text-sm">Loading queue…</p>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col min-h-screen max-w-md mx-auto px-4 py-8 select-none transition-colors duration-300"
      style={{ background: redFlash ? 'rgba(255,69,58,0.08)' : 'transparent' }}
    >
      <Confetti trigger={confetti} />

      <div className="flex items-center justify-between mb-6">
        <Link href="/" className="text-[var(--accent)] text-sm font-medium">← Back</Link>
        <span className="text-sm">
          <AnimatedCount value={remaining} />
          <span className="text-[var(--text2)]"> left</span>
        </span>
      </div>

      <h1 className="text-3xl font-bold tracking-tight mb-1">Review</h1>
      <p className="text-[var(--text2)] text-sm mb-8">Swipe right to apply · left to skip</p>

      {remaining > 0 ? (
        /* overflow-hidden clips the scaled-down cards behind so they don't bleed out */
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
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center mt-20">
          <div className="w-20 h-20 rounded-full flex items-center justify-center text-4xl" style={{ background: 'var(--surface)' }}>✓</div>
          <h2 className="text-xl font-semibold">All caught up</h2>
          <p className="text-[var(--text2)] text-sm">No more jobs in the queue.</p>
          <Link href="/" className="mt-4 px-6 py-3 rounded-2xl text-sm font-semibold" style={{ background: 'var(--accent)', color: '#fff' }}>
            Run pipeline again
          </Link>
        </div>
      )}

      {remaining > 0 && (
        <div className="flex items-center justify-center gap-10 mt-8">
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
      )}
    </div>
  );
}
