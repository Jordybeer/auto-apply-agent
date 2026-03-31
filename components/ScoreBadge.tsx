'use client';

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
  const bg    = score >= 70 ? 'rgba(74,222,128,0.12)' : score >= 40 ? 'rgba(251,191,36,0.12)' : 'rgba(248,113,113,0.12)';
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full font-semibold tabular-nums"
      style={{ background: bg, color, border: `1px solid ${color}44` }}
    >
      {score}%
    </span>
  );
}
