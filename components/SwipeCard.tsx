"use client";

import { useRef, useState } from 'react';
import Lottie, { LottieRefCurrentProps } from 'lottie-react';
import checkData from '@/app/lotties/checkmark.json';
import crossData from '@/app/lotties/cross.json';
import { SOURCE_COLORS, SOURCE_DOMAINS } from '@/lib/constants';

const AVATAR_COLORS = [
  '#0a84ff','#30d158','#bf5af2','#ff9f0a','#ff453a','#64d2ff','#ffd60a',
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');
}

function getMatchedKeywords(text: string, keywords: string[]): string[] {
  const lower = text.toLowerCase();
  return keywords.filter((kw) => lower.includes(kw.toLowerCase()));
}

function scoreColor(score: number): string {
  if (score >= 75) return 'var(--green)';
  if (score >= 50) return 'var(--yellow)';
  return 'var(--red)';
}

export type SwipeCardProps = {
  application: any;
  onSwipeLeft: (id: string) => void;
  onSwipeRight: (id: string) => void;
  isTop: boolean;
  activeKeywords?: string[];
  onDragX?: (x: number) => void;
};

export default function SwipeCard({ application, onSwipeLeft, onSwipeRight, isTop, activeKeywords = [], onDragX }: SwipeCardProps) {
  const { jobs, id, match_score, reasoning } = application;
  const source: string = jobs?.source || '';
  const color = SOURCE_COLORS[source] || { bg: 'rgba(255,255,255,0.08)', text: 'var(--text2)' };

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
    onDragX?.(dx);
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
      setDragX(0);
      setHint(null);
      onDragX?.(0);
    }
  };

  const rotation   = swipeDir ? 0 : dragX / 18;
  const translateX = swipeDir ? 0 : dragX;

  const company     = jobs?.company?.trim() || '';
  const description = jobs?.description?.trim() || '';
  const title       = jobs?.title?.trim() || '';
  const searchText  = `${title} ${description}`;
  const matched     = activeKeywords.length > 0 ? getMatchedKeywords(searchText, activeKeywords) : [];
  const initials    = company ? getInitials(company) : '?';
  const avatarColor = getAvatarColor(company || source);
  const descSnippet = description.length > 180 ? description.slice(0, 180).trimEnd() + '\u2026' : description;
  const infoLevel   = description.length === 0 ? 0 : description.length < 100 ? 1 : description.length < 300 ? 2 : 3;
  const infoLabels  = ['No details', 'Minimal info', 'Some details', 'Full details'];
  const infoColors  = ['var(--text2)', 'var(--yellow)', '#0a84ff', 'var(--green)'];
  const domain      = SOURCE_DOMAINS[source] || source;
  const hasScore    = typeof match_score === 'number' && match_score > 0;

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
        className="rounded-3xl w-full h-full flex flex-col overflow-hidden border"
        style={{ background: 'var(--card-bg)', borderColor: 'var(--border)', boxShadow: 'var(--shadow)' }}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 flex flex-col gap-1.5 flex-shrink-0">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="text-xs font-semibold px-2.5 py-0.5 rounded-full flex-shrink-0"
                style={{ background: color.bg, color: color.text }}
              >
                {source || '?'}
              </span>
              {company && (
                <span className="text-xs font-medium truncate" style={{ color: 'var(--text2)' }}>
                  {company}
                </span>
              )}
            </div>
            {hasScore && (
              <div
                className="flex items-center gap-1 px-2.5 py-1 rounded-full flex-shrink-0"
                style={{
                  background: `color-mix(in srgb, ${scoreColor(match_score)} 12%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${scoreColor(match_score)} 35%, transparent)`,
                }}
              >
                <span className="text-xs font-bold tabular-nums" style={{ color: scoreColor(match_score) }}>
                  {match_score}%
                </span>
              </div>
            )}
          </div>
          <h2
            className="text-lg font-bold leading-snug tracking-tight"
            style={{
              color: 'var(--text)',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {title || 'Unknown Title'}
          </h2>
        </div>

        {/* Job Intel Panel */}
        <div
          className="flex-1 min-h-0 mx-4 mb-2 rounded-2xl overflow-hidden flex flex-col gap-0"
          style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}
        >
          {/* Company row */}
          <div
            className="flex items-center gap-3 px-4 pt-4 pb-3 flex-shrink-0"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0"
              style={{ background: `${avatarColor}22`, color: avatarColor, border: `1.5px solid ${avatarColor}44` }}
            >
              {initials}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{company || 'Unknown company'}</span>
              <span className="text-xs" style={{ color: 'var(--text2)' }}>{domain}</span>
            </div>
            <div className="ml-auto flex flex-col items-end gap-0.5 flex-shrink-0">
              <span className="text-xs font-medium" style={{ color: infoColors[infoLevel] }}>
                {infoLabels[infoLevel]}
              </span>
              <div className="flex gap-0.5">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-4 h-1 rounded-full"
                    style={{ background: i < infoLevel ? infoColors[infoLevel] : 'var(--border)' }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* AI Reasoning */}
          {reasoning && (
            <div
              className="px-4 py-2.5 flex-shrink-0"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <p className="text-xs leading-relaxed" style={{ color: '#a78bfa' }}>
                🤖 {reasoning}
              </p>
            </div>
          )}

          {/* Matched keywords */}
          {matched.length > 0 && (
            <div
              className="px-4 py-2.5 flex flex-wrap gap-1.5 flex-shrink-0"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              {matched.map((kw) => (
                <span
                  key={kw}
                  className="text-xs font-medium px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(74,222,128,0.12)', color: 'var(--green)' }}
                >
                  ✓ {kw}
                </span>
              ))}
            </div>
          )}

          {/* Description */}
          <div className="flex-1 min-h-0 px-4 py-3 overflow-y-auto">
            {descSnippet ? (
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text3)' }}>
                {descSnippet}
              </p>
            ) : (
              <p className="text-xs italic" style={{ color: 'var(--text2)' }}>
                No description scraped — open the listing for full details.
              </p>
            )}
          </div>
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
              className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl font-semibold text-sm text-white transition-colors"
              style={{ background: 'var(--accent)' }}
            >
              Open Listing ↗
            </a>
          ) : (
            <div className="w-full py-3 rounded-2xl text-center text-sm" style={{ background: 'var(--surface2)', color: 'var(--text2)' }}>No URL</div>
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
