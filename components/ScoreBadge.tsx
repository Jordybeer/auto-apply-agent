'use client';

/**
 * Unified ScoreBadge — used in Queue, Saved, and Applied.
 * Shows a pulsing placeholder for unscored jobs (score === null).
 */
export default function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <span
        className="skeleton text-xs px-2 py-0.5 rounded-full font-medium tabular-nums inline-flex items-center"
        aria-label="Score wordt berekend"
        style={{ color: 'var(--text3)', minWidth: '3.5rem' }}
      >
        &nbsp;
      </span>
    );
  }
  const color  = score >= 70 ? 'var(--green)' : score >= 40 ? 'var(--yellow)' : 'var(--red)';
  const bg     = score >= 70 ? 'var(--green-dim)' : score >= 40 ? 'var(--yellow-dim)' : 'var(--red-dim)';
  const border = score >= 70 ? 'rgba(52,211,153,0.25)' : score >= 40 ? 'rgba(251,191,36,0.25)' : 'rgba(251,113,133,0.25)';
  const label  = score >= 70 ? 'Goede match' : score >= 40 ? 'Gemiddelde match' : 'Slechte match';
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full font-semibold tabular-nums"
      aria-label={`${score}% — ${label}`}
      style={{ background: bg, color, border: `1px solid ${border}` }}
    >
      {score}%
    </span>
  );
}
