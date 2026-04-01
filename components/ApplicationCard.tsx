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

export default function ApplicationCard({
  application,
  onAction,
}: {
  application: any;
  onAction: (id: string, status: string) => void;
}) {
  const { jobs, id, status, note } = application;
  const source: string = jobs?.source || '';
  const sourceBadge = SOURCE_COLORS[source] || 'glass-btn';
  const isInProgress = status === 'in_progress';
  const isApplied    = status === 'applied';

  return (
    <div
      className="glass-card glass-highlight relative rounded-2xl p-5 flex flex-col gap-4 overflow-hidden"
    >
      {/* Sparkles for in_progress */}
      {isInProgress && (
        <div className="absolute inset-0 pointer-events-none z-0" aria-hidden>
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
          <h2 className="text-xl font-bold leading-tight text-primary">{jobs?.title || 'Unknown Title'}</h2>
          <p className="text-sm text-secondary">{jobs?.company || 'Unknown Company'}</p>
        </div>
        {source && (
          <span className={`shrink-0 text-xs px-2 py-1 rounded-full font-medium ${sourceBadge}`}>
            {source}
          </span>
        )}
      </div>

      {/* Action row */}
      <div className="relative z-10 flex flex-wrap gap-3 pt-2 glass-divider" style={{ borderTop: '1px solid var(--divider)' }}>
        {/* spacer so the divider renders correctly */}
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
