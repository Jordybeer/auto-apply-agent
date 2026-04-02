"use client";

import Lottie from 'lottie-react';
import sparklesJson from '@/app/lotties/sparkles.json';
import NoteButton from '@/components/NoteButton';

// Source badges — using design-system token classes
const SOURCE_COLORS: Record<string, string> = {
  jobat:     'badge-blue',
  stepstone: 'badge-purple',
  ictjob:    'badge-teal',
};

function mapsUrl(location: string): string {
  const origin = encodeURIComponent('Kapellen Station, Kapellen, Belgium');
  const dest   = encodeURIComponent(location + ', Belgium');
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=transit`;
}

export default function ApplicationCard({
  application,
  onAction,
}: {
  application: any;
  onAction: (id: string, status: string) => void;
}) {
  const { jobs, id, status, note } = application;
  const source: string   = jobs?.source   || '';
  const location: string = jobs?.location || '';
  const sourceBadge = SOURCE_COLORS[source] || 'glass-btn';
  const isInProgress = status === 'in_progress';
  const isApplied    = status === 'applied';

  function openMaps() {
    window.open(mapsUrl(location), '_blank', 'noopener,noreferrer');
  }

  return (
    <div
      className="glass-card glass-highlight relative rounded-2xl p-5 flex flex-col gap-4"
    >
      {/* Sparkles for in_progress */}
      {isInProgress && (
        <div className="absolute inset-0 pointer-events-none z-0 rounded-2xl overflow-hidden" aria-hidden>
          <Lottie
            animationData={sparklesJson}
            loop
            autoplay
            style={{ width: '100%', height: '100%', opacity: 0.18 }}
          />
        </div>
      )}

      {/* Header row */}
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-bold leading-tight text-primary">
            {jobs?.title || 'Unknown Title'}
          </h2>

          {/* Company */}
          <p className="text-sm font-medium" style={{ color: 'var(--accent-bright)' }}>
            {jobs?.company || 'Unknown Company'}
          </p>

          {/* Location */}
          {location && (
            <p
              className="flex items-center gap-1 text-xs"
              style={{ color: 'var(--text3)' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M20 10c0 6-8 13-8 13S4 16 4 10a8 8 0 0 1 16 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              {location}
            </p>
          )}
        </div>

        {source && (
          <span className={`shrink-0 text-xs px-2 py-1 rounded-full font-medium ${sourceBadge}`}>
            {source}
          </span>
        )}
      </div>

      {/* Action row */}
      <div className="relative z-10 flex flex-wrap gap-3 pt-2" style={{ borderTop: '1px solid var(--divider)' }}>
        <div className="w-full" />

        {jobs?.url && (
          <a
            href={jobs.url}
            target="_blank"
            rel="noreferrer"
            className="glass-btn inline-flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-medium"
          >
            Open Listing ↗
          </a>
        )}

        {/* Maps button */}
        {location && (
          <button
            onClick={openMaps}
            aria-label={`Open route naar ${location} in Google Maps`}
            className="glass-btn inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium"
            style={{ color: 'var(--teal)' }}
          >
            🗺️ Route
          </button>
        )}

        {isApplied && (
          <NoteButton applicationId={id} initialNote={note ?? ''} />
        )}

        <button
          onClick={() => onAction(id, 'applied')}
          className="inline-flex items-center px-4 py-2 rounded-xl text-sm font-medium transition-opacity hover:opacity-85"
          style={{ background: 'var(--green-dim)', color: 'var(--green)', border: '1px solid rgba(52,211,153,0.25)' }}
        >
          Mark Applied ✓
        </button>
        <button
          onClick={() => onAction(id, 'skipped')}
          className="glass-btn px-4 py-2 rounded-xl text-sm font-medium"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
