'use client';

/**
 * Unified ScoreBadge — used in Queue, Saved, and Applied.
 * Shows a spinner for unscored jobs (score === null) instead of rendering nothing.
 */
export default function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <span
        className="text-xs px-2 py-0.5 rounded-full font-medium tabular-nums"
        style={{ background: 'var(--surface2)', color: 'var(--text2)' }}
      >
        ⏳ scoring…
      </span>
    );
  }
  const color = score >= 70 ? 'var(--green)' : score >= 40 ? 'var(--yellow)' : 'var(--red)';
  const bg    = score >= 70 ? 'var(--green-dim)' : score >= 40 ? 'var(--yellow-dim)' : 'var(--red-dim)';
  const border = score >= 70 ? 'rgba(52,211,153,0.25)' : score >= 40 ? 'rgba(251,191,36,0.25)' : 'rgba(251,113,133,0.25)';
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full font-semibold tabular-nums"
      style={{ background: bg, color, border: `1px solid ${border}` }}
    >
      {score}%
    </span>
  );
}
