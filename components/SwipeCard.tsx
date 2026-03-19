"use client";

import { useRef, useState } from 'react';
import Lottie, { LottieRefCurrentProps } from 'lottie-react';
import checkData from '@/app/lotties/checkmark.json';
import crossData from '@/app/lotties/cross.json';

const SOURCE_COLORS: Record<string, { bg: string; text: string }> = {
  jobat:     { bg: 'rgba(10,132,255,0.18)',  text: '#0a84ff' },
  stepstone: { bg: 'rgba(191,90,242,0.18)', text: '#bf5af2' },
  ictjob:    { bg: 'rgba(48,209,88,0.18)',  text: '#30d158' },
};

export type SwipeCardProps = {
  application: any;
  onSwipeLeft: (id: string) => void;
  onSwipeRight: (id: string) => void;
  isTop: boolean;
};

export default function SwipeCard({ application, onSwipeLeft, onSwipeRight, isTop }: SwipeCardProps) {
  const { jobs, id } = application;
  const source: string = jobs?.source || '';
  const color = SOURCE_COLORS[source] || { bg: 'rgba(255,255,255,0.08)', text: '#aeaeb2' };

  const [swipeDir, setSwipeDir] = useState<'left' | 'right' | null>(null);
  const [hint, setHint]         = useState<'left' | 'right' | null>(null);
  const dragStart               = useRef<{ x: number; y: number } | null>(null);
  const [dragX, setDragX]       = useState(0);
  const checkRef                = useRef<LottieRefCurrentProps>(null);
  const crossRef                = useRef<LottieRefCurrentProps>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!isTop) return;
    dragStart.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragStart.current || !isTop) return;
    const dx = e.clientX - dragStart.current.x;
    setDragX(dx);
    if (dx > 40) {
      setHint('right'); checkRef.current?.play();
    } else if (dx < -40) {
      setHint('left'); crossRef.current?.play();
    } else {
      setHint(null); checkRef.current?.stop(); crossRef.current?.stop();
    }
  };

  const onPointerUp = () => {
    if (!dragStart.current) return;
    dragStart.current = null;
    if (dragX > 80) {
      setSwipeDir('right');
      setTimeout(() => onSwipeRight(id), 380);
    } else if (dragX < -80) {
      setSwipeDir('left');
      setTimeout(() => onSwipeLeft(id), 380);
    } else {
      setDragX(0); setHint(null);
    }
  };

  const rotation   = swipeDir ? 0 : dragX / 18;
  const translateX = swipeDir ? 0 : dragX;

  return (
    <div
      className={`absolute inset-0 select-none touch-none ${
        swipeDir === 'left'  ? 'animate-swipe-left'  :
        swipeDir === 'right' ? 'animate-swipe-right' : ''
      }`}
      style={{
        transform: swipeDir ? undefined : `translateX(${translateX}px) rotate(${rotation}deg)`,
        transition: dragStart.current ? 'none' : 'transform 0.25s ease',
        cursor: isTop ? 'grab' : 'default',
        zIndex: isTop ? 10 : 0,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Solid background — no glass bleed from cards below */}
      <div
        className="rounded-3xl w-full h-full flex flex-col overflow-hidden shadow-2xl border"
        style={{
          background: '#1c1c1e',
          borderColor: 'rgba(255,255,255,0.09)',
        }}
      >
        <div className="px-6 pt-7 pb-4 flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span
              className="text-xs font-semibold px-3 py-1 rounded-full"
              style={{ background: color.bg, color: color.text }}
            >
              {source || 'unknown'}
            </span>
          </div>
          <h2 className="text-2xl font-bold mt-3 leading-tight tracking-tight">
            {jobs?.title || 'Unknown Title'}
          </h2>
          <p className="text-[var(--text2)] text-base font-medium">{jobs?.company || ''}</p>
        </div>

        <div className="flex-1 px-6 overflow-y-auto">
          <p className="text-sm text-[var(--text2)] leading-relaxed">
            {jobs?.description || 'No description available.'}
          </p>
        </div>

        <div className="px-6 pb-6 pt-4">
          {jobs?.url ? (
            <a
              href={jobs.url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl font-semibold text-sm"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              Open Listing ↗
            </a>
          ) : (
            <div className="w-full py-3 rounded-2xl text-center text-sm text-[var(--text2)] bg-white/5">No URL</div>
          )}
        </div>
      </div>

      {/* Swipe hints */}
      <div
        className="absolute top-8 left-6 pointer-events-none transition-opacity duration-150"
        style={{ opacity: hint === 'left' ? 1 : 0 }}
      >
        <div className="rounded-2xl border-2 px-3 py-2" style={{ borderColor: 'var(--red)' }}>
          <Lottie lottieRef={crossRef} animationData={crossData} loop={false} autoplay={false} style={{ width: 40, height: 40 }} />
        </div>
      </div>
      <div
        className="absolute top-8 right-6 pointer-events-none transition-opacity duration-150"
        style={{ opacity: hint === 'right' ? 1 : 0 }}
      >
        <div className="rounded-2xl border-2 px-3 py-2" style={{ borderColor: 'var(--green)' }}>
          <Lottie lottieRef={checkRef} animationData={checkData} loop={false} autoplay={false} style={{ width: 40, height: 40 }} />
        </div>
      </div>
    </div>
  );
}
