"use client";

const SOURCE_COLORS: Record<string, string> = {
  jobat: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  stepstone: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30',
  ictjob: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
};

export default function ApplicationCard({
  application,
  onAction,
}: {
  application: any;
  onAction: (id: string, status: string) => void;
}) {
  const { jobs, id } = application;
  const source: string = jobs?.source || '';
  const sourceBadge = SOURCE_COLORS[source] || 'bg-zinc-700 text-zinc-300 border-zinc-600';

  return (
    <div className="border border-zinc-800 rounded-xl p-5 bg-zinc-900/30 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-bold leading-tight">{jobs?.title || 'Unknown Title'}</h2>
          <p className="text-zinc-400 text-sm">{jobs?.company || 'Unknown Company'}</p>
        </div>
        {source && (
          <span className={`shrink-0 text-xs px-2 py-1 rounded-full border font-medium ${sourceBadge}`}>
            {source}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-3 pt-2 border-t border-zinc-800">
        {jobs?.url && (
          <a
            href={jobs.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 bg-white text-black px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-100 transition-colors"
          >
            Open Listing ↗
          </a>
        )}
        <button
          onClick={() => onAction(id, 'applied')}
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          Mark Applied ✓
        </button>
        <button
          onClick={() => onAction(id, 'skipped')}
          className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
