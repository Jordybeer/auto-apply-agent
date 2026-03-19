"use client";

import { useRef, useState } from 'react';
import Lottie, { LottieRefCurrentProps } from 'lottie-react';
import checkData from '@/app/lotties/checkmark.json';
import crossData from '@/app/lotties/cross.json';

const SOURCE_COLORS: Record<string, { bg: string; text: string }> = {
  jobat:     { bg: 'rgba(10,132,255,0.18)',  text: '#0a84ff' },
  stepstone: { bg: 'rgba(191,90,242,0.18)', text: '#bf5af2' },
  ictjob:    { bg: 'rgba(48,209,88,0.18)',  text: '#30d158' },
  vdab:      { bg: 'rgba(255,159,10,0.18)', text: '#ff9f0a' },
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

  const hasDescription = !!(jobs?.description?.trim());
  const company        = jobs?.company?.trim() || '';
  const googleStaticQuery = encodeURIComponent(`${company}, Antwerpen, Belgium`);
  const mapsUrl        = `https://maps.google.com/maps?q=${googleStaticQuery}&output=embed&hl=en&z=14`;

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
      <div
        className="rounded-3xl w-full h-full flex flex-col overflow-hidden shadow-2xl border"
        style={{ background: '#1c1c1e', borderColor: 'rgba(255,255,255,0.09)' }}
      >
        {/* Header: badge + company on one line, title below */}
        <div className="px-5 pt-5 pb-3 flex flex-col gap-1.5 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="text-xs font-semibold px-2.5 py-0.5 rounded-full flex-shrink-0"
              style={{ background: color.bg, color: color.text }}
            >
              {source || '?'}
            </span>
            {company && (
              <span
                className="text-xs font-medium truncate"
                style={{ color: 'var(--text2)' }}
              >
                {company}
              </span>
            )}
          </div>
          <h2
            className="text-lg font-bold leading-snug tracking-tight"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {jobs?.title || 'Unknown Title'}
          </h2>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 mx-4 mb-2 rounded-2xl overflow-hidden">
          {hasDescription ? (
            <div className="h-full overflow-y-auto px-1 py-1">
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text2)' }}>
                {jobs.description}
              </p>
            </div>
          ) : company ? (
            <div className="w-full h-full rounded-2xl overflow-hidden relative" style={{ minHeight: '160px' }}>
              <iframe
                src={mapsUrl}
                width="100%"
                height="100%"
                style={{ border: 'none', display: 'block', minHeight: '160px', pointerEvents: 'none' }}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
              <a
                href={`https://www.google.com/maps/search/${googleStaticQuery}`}
                target="_blank"
                rel="noreferrer"
                className="absolute bottom-2 right-2 text-xs font-semibold px-2.5 py-1 rounded-xl"
                style={{ background: 'rgba(0,0,0,0.55)', color: '#fff', backdropFilter: 'blur(6px)' }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                Open ↗
              </a>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <p className="text-xs" style={{ color: 'var(--text2)' }}>No details available.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-2 flex-shrink-0">
          {jobs?.url ? (
            <a
              href={jobs.url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl font-semibold text-sm"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              Open Listing ↗
            </a>
          ) : (
            <div className="w-full py-3 rounded-2xl text-center text-sm bg-white/5" style={{ color: 'var(--text2)' }}>No URL</div>
          )}
        </div>
      </div>

      {/* Swipe hints */}
      <div className="absolute top-6 left-5 pointer-events-none transition-opacity duration-150" style={{ opacity: hint === 'left' ? 1 : 0 }}>
        <div className="rounded-2xl border-2 px-3 py-2" style={{ borderColor: 'var(--red)' }}>
          <Lottie lottieRef={crossRef} animationData={crossData} loop={false} autoplay={false} style={{ width: 40, height: 40 }} />
        </div>
      </div>
      <div className="absolute top-6 right-5 pointer-events-none transition-opacity duration-150" style={{ opacity: hint === 'right' ? 1 : 0 }}>
        <div className="rounded-2xl border-2 px-3 py-2" style={{ borderColor: 'var(--green)' }}>
          <Lottie lottieRef={checkRef} animationData={checkData} loop={false} autoplay={false} style={{ width: 40, height: 40 }} />
        </div>
      </div>
    </div>
  );
}
