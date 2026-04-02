"use client";

import { useRef, useState } from 'react';
import Lottie, { LottieRefCurrentProps } from 'lottie-react';
import checkData from '@/app/lotties/checkmark.json';
import crossData from '@/app/lotties/cross.json';
import { SOURCE_COLORS, SOURCE_DOMAINS } from '@/lib/constants';
import { requiresDriverLicense } from '@/lib/openai';

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
function mapsUrl(location: string): string {
  const origin = encodeURIComponent('Kapellen Station, Kapellen, Belgium');
  const dest   = encodeURIComponent(location + ', Belgium');
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=transit`;
}

export type SwipeCardProps = {
  application: any;
  onSwipeLeft: (id: string) => void;
  onSwipeRight: (id: string) => void;
  isTop: boolean;
  activeKeywords?: string[];
  onDragX?: (x: number) => void;
  onRematch?: (id: string) => void;
  rematchLoading?: boolean;
  onOpenAnalysis?: (app: any) => void;
};

export default function SwipeCard({
  application, onSwipeLeft, onSwipeRight, isTop, activeKeywords = [], onDragX, onRematch, rematchLoading, onOpenAnalysis,
}: SwipeCardProps) {
  const { jobs, id, match_score, reasoning, resume_bullets_draft } = application;
  const source: string   = jobs?.source   || '';
  const location: string = jobs?.location || '';
  const color = SOURCE_COLORS[source] || { bg: 'rgba(255,255,255,0.08)', text: 'var(--text2)' };

  const [swipeDir, setSwipeDir] = useState<'left' | 'right' | null>(null);
  const [hint, setHint] = useState<'left' | 'right' | null>(null);
  const [dragX, setDragX] = useState(0);
  const [springing, setSpringing] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const dragStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const lastX = useRef(0);
  const checkRef = useRef<LottieRefCurrentProps>(null);
  const crossRef = useRef<LottieRefCurrentProps>(null);

  const triggerLeft = () => {
    setSwipeDir('left');
    onDragX?.(0);
    setTimeout(() => onSwipeLeft(id), 380);
  };
  const triggerRight = () => {
    setSwipeDir('right');
    onDragX?.(0);
    setTimeout(() => onSwipeRight(id), 380);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!isTop) return;
    dragStart.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    lastX.current = e.clientX;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragStart.current || !isTop) return;
    const dx = e.clientX - dragStart.current.x;
    lastX.current = e.clientX;
    setDragX(dx);
    onDragX?.(dx);
    if (dx > 30) {
      setHint('right'); checkRef.current?.play();
    } else if (dx < -30) {
      setHint('left'); crossRef.current?.play();
    } else {
      setHint(null); checkRef.current?.stop(); crossRef.current?.stop();
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragStart.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dt = Math.max(Date.now() - dragStart.current.t, 1);
    const velocity = dx / dt;
    dragStart.current = null;

    const farEnough = Math.abs(dx) > 60;
    const fastEnough = Math.abs(velocity) > 0.3;

    if (farEnough || fastEnough) {
      if (dx > 0) triggerRight();
      else triggerLeft();
    } else {
      setSpringing(true);
      setDragX(0);
      setHint(null);
      onDragX?.(0);
      checkRef.current?.stop();
      crossRef.current?.stop();
      setTimeout(() => setSpringing(false), 300);
    }
  };

  const rotation = swipeDir ? 0 : dragX / 18;
  const translateX = swipeDir ? 0 : dragX;

  const company = jobs?.company?.trim() || '';
  const description = jobs?.description?.trim() || '';
  const title = jobs?.title?.trim() || '';
  const searchText = `${title} ${description}`;
  const matched = activeKeywords.length > 0 ? getMatchedKeywords(searchText, activeKeywords) : [];
  const initials = company ? getInitials(company) : '?';
  const avatarColor = getAvatarColor(company || source);
  const descSnippet = description;
  const infoLevel = description.length === 0 ? 0 : description.length < 100 ? 1 : description.length < 300 ? 2 : 3;
  const infoLabels = ['No details', 'Minimal info', 'Some details', 'Full details'];
  const infoColors = ['var(--text2)', 'var(--yellow)', '#0a84ff', 'var(--green)'];
  const domain = SOURCE_DOMAINS[source] || source;
  const hasScore = typeof match_score === 'number' && match_score > 0;
  const scoreIsNull = match_score === null || match_score === undefined;
  const needsLicense = requiresDriverLicense(description);
  const bullets: string[] = Array.isArray(resume_bullets_draft) ? resume_bullets_draft : [];

  const handleAnalysisClick = (e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
    if (onOpenAnalysis) {
      onOpenAnalysis(application);
    } else {
      setShowAnalysis((v) => !v);
    }
  };

  return (
    <div
      className={`absolute inset-0 select-none touch-none ${
        swipeDir === 'left' ? 'animate-swipe-left' :
        swipeDir === 'right' ? 'animate-swipe-right' : ''
      }`}
      style={{
        transform: swipeDir ? undefined : `translateX(${translateX}px) rotate(${rotation}deg)`,
        transition: springing ? 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1)' : dragStart.current ? 'none' : 'transform 0.25s ease',
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
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full flex-shrink-0" style={{ background: color.bg, color: color.text }}>
                {source || '?'}
              </span>
              {company && <span className="text-xs font-medium truncate" style={{ color: 'var(--text2)' }}>{company}</span>}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {needsLicense && (
                <div className="flex items-center gap-1 px-2 py-1 rounded-full" title="Rijbewijs vereist"
                  style={{ background: 'rgba(255,69,58,0.12)', border: '1px solid rgba(255,69,58,0.35)' }}>
                  <span className="text-xs">🚗</span>
                </div>
              )}
              {hasScore ? (
                <button
                  type="button"
                  onClick={handleAnalysisClick}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
                  style={{
                    background: showAnalysis
                      ? `color-mix(in srgb, ${scoreColor(match_score)} 22%, transparent)`
                      : `color-mix(in srgb, ${scoreColor(match_score)} 14%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${scoreColor(match_score)} 38%, transparent)`,
                    color: scoreColor(match_score),
                    transition: 'background 0.18s ease',
                  }}
                >
                  <span>{showAnalysis ? 'Sluit' : 'Analyse'}</span>
                  <span className="tabular-nums">{match_score}%</span>
                </button>
              ) : scoreIsNull ? (
                <button
                  onClick={(e) => { e.stopPropagation(); onRematch?.(id); }}
                  onPointerDown={(e) => e.stopPropagation()}
                  disabled={rematchLoading}
                  title="Klik om match score te genereren"
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all disabled:opacity-50"
                  style={{
                    background: rematchLoading ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${rematchLoading ? 'rgba(99,102,241,0.35)' : 'var(--border)'}`,
                    cursor: rematchLoading ? 'wait' : 'pointer',
                  }}
                >
                  {rematchLoading ? (
                    <span
                      className="inline-block w-3.5 h-3.5 rounded-full border-2"
                      style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent', animation: 'spin 0.75s linear infinite' }}
                    />
                  ) : (
                    <span className="text-xs">⏳</span>
                  )}
                  <span className="text-xs font-medium" style={{ color: rematchLoading ? 'var(--accent)' : 'var(--text2)' }}>
                    {rematchLoading ? 'Laden…' : 'Score'}
                  </span>
                </button>
              ) : null}
            </div>
          </div>
          <h2 className="text-lg font-bold leading-snug tracking-tight"
            style={{ color: 'var(--text)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {title || 'Unknown Title'}
          </h2>
        </div>

        {/* Job Intel Panel */}
        <div className="flex-1 min-h-0 mx-4 mb-2 rounded-2xl overflow-hidden flex flex-col gap-0 relative"
          style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3 px-4 pt-4 pb-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0"
              style={{ background: `${avatarColor}22`, color: avatarColor, border: `1.5px solid ${avatarColor}44` }}>
              {initials}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{company || 'Unknown company'}</span>
              <span className="text-xs" style={{ color: 'var(--text2)' }}>{domain}</span>
            </div>
            <div className="ml-auto flex flex-col items-end gap-0.5 flex-shrink-0">
              <span className="text-xs font-medium" style={{ color: infoColors[infoLevel] }}>{infoLabels[infoLevel]}</span>
              <div className="flex gap-0.5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="w-4 h-1 rounded-full"
                    style={{ background: i < infoLevel ? infoColors[infoLevel] : 'var(--border)' }} />
                ))}
              </div>
            </div>
          </div>

          {matched.length > 0 && (
            <div className="px-4 py-2.5 flex flex-wrap gap-1.5 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
              {matched.map((kw) => (
                <span key={kw} className="text-xs font-medium px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(74,222,128,0.12)', color: 'var(--green)' }}>✓ {kw}</span>
              ))}
            </div>
          )}

          {/* Analyse overlay */}
          <div
            className="absolute inset-x-0 top-0 bottom-0 z-20 flex flex-col"
            style={{
              opacity: showAnalysis ? 1 : 0,
              pointerEvents: showAnalysis ? 'auto' : 'none',
              transition: 'opacity 0.2s ease',
            }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div
              className="flex-1 overflow-y-auto rounded-2xl px-4 py-4 space-y-3"
              style={{
                background: 'color-mix(in srgb, var(--card-bg) 97%, transparent)',
                backdropFilter: 'blur(8px)',
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold tracking-widest uppercase" style={{ color: '#a78bfa', letterSpacing: '0.08em' }}>AI Analyse</span>
                <span className="text-xs font-bold tabular-nums px-2 py-0.5 rounded-full"
                  style={{
                    background: `color-mix(in srgb, ${scoreColor(match_score)} 14%, transparent)`,
                    color: scoreColor(match_score),
                  }}>
                  {match_score}%
                </span>
              </div>
              {reasoning && (
                <p className="text-xs leading-relaxed" style={{ color: '#c4b5fd' }}>{reasoning}</p>
              )}
              {bullets.length > 0 && (
                <ul className="space-y-1.5">
                  {bullets.map((b, i) => (
                    <li key={i} className="text-xs leading-relaxed flex items-start gap-1.5" style={{ color: 'var(--text2)' }}>
                      <span style={{ color: '#a78bfa', flexShrink: 0 }}>›</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="flex-1 min-h-0 px-4 py-3 overflow-y-auto">
            {descSnippet ? (
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text3)' }}>{descSnippet}</p>
            ) : (
              <p className="text-xs italic" style={{ color: 'var(--text2)' }}>
                No description scraped — open the listing for full details.
              </p>
            )}
          </div>
        </div>

        {/* Footer: Open Listing + Maps route */}
        <div className="px-5 pb-5 pt-2 flex-shrink-0 flex gap-2">
          {jobs?.url
            ? <a href={jobs.url} target="_blank" rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-semibold text-sm text-white"
                style={{ background: 'var(--accent)' }}>Open Listing ↗</a>
            : <div className="flex-1 py-3 rounded-2xl text-center text-sm" style={{ background: 'var(--surface2)', color: 'var(--text2)' }}>No URL</div>
          }
          {location && (
            <a
              href={mapsUrl(location)}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label={`Open route naar ${location} in Google Maps`}
              className="flex items-center justify-center gap-1.5 px-4 py-3 rounded-2xl text-sm font-semibold"
              style={{ background: 'var(--surface2)', color: 'var(--teal)', border: '1px solid var(--border)' }}
            >
              🗺️
            </a>
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
