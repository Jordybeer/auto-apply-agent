'use client';

export default function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Laden…">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl p-4 flex flex-col gap-3"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          {/* Title + badge row */}
          <div className="flex items-center gap-2">
            <div className="skeleton h-4 rounded-lg flex-1 max-w-[55%]" />
            <div className="skeleton h-5 w-10 rounded-full" />
          </div>
          {/* Company + location row */}
          <div className="flex items-center gap-2">
            <div className="skeleton h-3 rounded-lg w-[40%]" />
            <div className="skeleton h-3 rounded-lg w-[28%]" />
          </div>
          {/* Reasoning excerpt */}
          <div className="flex flex-col gap-1.5">
            <div className="skeleton h-3 rounded-lg w-full" />
            <div className="skeleton h-3 rounded-lg w-[80%]" />
          </div>
          {/* Action row */}
          <div className="flex items-center gap-2 pt-1" style={{ borderTop: '1px solid var(--divider)' }}>
            <div className="skeleton h-8 w-20 rounded-xl" />
            <div className="skeleton h-8 w-20 rounded-xl ml-auto" />
            <div className="skeleton h-8 w-24 rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}
