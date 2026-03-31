'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, XCircle, RefreshCw, Briefcase, Building2, PlusCircle, Trash2 } from 'lucide-react';
import ScoreBadge from '@/components/ScoreBadge';
import SkeletonCards from '@/components/SkeletonCards';
import ApplyModal from '@/components/ApplyModal';
import ManualApplyModal from '@/components/ManualApplyModal';
import RematchButton from '@/components/RematchButton';

interface Job {
  title: string;
  company: string;
  url: string | null;
  source: string | null;
  description: string | null;
}

interface Application {
  id: string;
  status: string;
  match_score: number | null;
  reasoning: string | null;
  cover_letter_draft?: string | null;
  jobs: Job | null;
}

type ScoreFilter = 'all' | 'high' | 'mid' | 'low';

const SCORE_FILTERS: { key: ScoreFilter; label: string }[] = [
  { key: 'all',  label: 'Alles'  },
  { key: 'high', label: '\u226575%' },
  { key: 'mid',  label: '50\u201374%' },
  { key: 'low',  label: '<50%'   },
];

function matchesScore(score: number | null, filter: ScoreFilter) {
  if (filter === 'all' || score === null) return true;
  if (filter === 'high') return score >= 75;
  if (filter === 'mid')  return score >= 50 && score < 75;
  return score < 50;
}

const BULK_SKIP_THRESHOLD = 40;

export default function QueuePage() {
  const [apps, setApps]             = useState<Application[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [acting, setActing]         = useState<Record<string, boolean>>({});
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [applyTarget, setApplyTarget] = useState<Application | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [bulkSkipping, setBulkSkipping] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/queue');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setApps(data.applications ?? []);
    } catch (e: any) {
      setError(e.message ?? 'Laden mislukt');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Unique sources from current queue
  const sources = useMemo(() => {
    const s = new Set(apps.map(a => a.jobs?.source).filter(Boolean) as string[]);
    return ['all', ...Array.from(s)];
  }, [apps]);

  const filtered = useMemo(() => apps.filter(a =>
    matchesScore(a.match_score, scoreFilter) &&
    (sourceFilter === 'all' || a.jobs?.source === sourceFilter)
  ), [apps, scoreFilter, sourceFilter]);

  const lowCount = useMemo(() => apps.filter(a =>
    a.match_score !== null && a.match_score < BULK_SKIP_THRESHOLD
  ).length, [apps]);

  const act = async (id: string, status: 'saved' | 'skipped') => {
    setActing(prev => ({ ...prev, [id]: true }));
    try {
      await fetch('/api/queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      setApps(prev => prev.filter(a => a.id !== id));
    } catch {
      // silently keep card on failure
    } finally {
      setActing(prev => ({ ...prev, [id]: false }));
    }
  };

  // "Save" then immediately open ApplyModal so the cover letter pipeline runs
  const save = async (app: Application) => {
    await act(app.id, 'saved');
    setApplyTarget(app);
  };

  const bulkSkipLow = async () => {
    if (bulkSkipping) return;
    setBulkSkipping(true);
    const low = apps.filter(a => a.match_score !== null && a.match_score < BULK_SKIP_THRESHOLD);
    await Promise.all(low.map(a => act(a.id, 'skipped')));
    setBulkSkipping(false);
  };

  return (
    <main className="page-shell flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Wachtrij</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text2)' }}>
            {loading ? 'Laden\u2026' : `${filtered.length} van ${apps.length} vacature${apps.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowManual(true)}
            className="flex items-center justify-center w-9 h-9 rounded-xl"
            style={{ background: 'var(--surface2)', color: 'var(--accent)' }}
            aria-label="Manueel toevoegen"
          >
            <PlusCircle className="w-5 h-5" />
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl transition-opacity disabled:opacity-40"
            style={{ background: 'var(--surface2)', color: 'var(--text2)' }}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Vernieuwen
          </button>
        </div>
      </div>

      {/* Score filter chips */}
      {!loading && apps.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {SCORE_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setScoreFilter(f.key)}
              className="text-xs px-3 py-1 rounded-full font-medium transition-all"
              style={{
                background: scoreFilter === f.key ? 'var(--accent)' : 'var(--surface2)',
                color: scoreFilter === f.key ? '#fff' : 'var(--text2)',
              }}
            >
              {f.label}
            </button>
          ))}

          {/* Source filter chips — only show when > 1 source */}
          {sources.length > 2 && sources.filter(s => s !== 'all').map(src => (
            <button
              key={src}
              onClick={() => setSourceFilter(prev => prev === src ? 'all' : src)}
              className="text-xs px-3 py-1 rounded-full font-medium capitalize transition-all"
              style={{
                background: sourceFilter === src ? 'var(--accent)' : 'var(--surface2)',
                color: sourceFilter === src ? '#fff' : 'var(--text2)',
              }}
            >
              {src}
            </button>
          ))}
        </div>
      )}

      {/* Bulk skip CTA */}
      {!loading && lowCount > 0 && (
        <motion.button
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={bulkSkipLow}
          disabled={bulkSkipping}
          className="flex items-center gap-2 w-full px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-40"
          style={{
            background: 'rgba(248,113,113,0.08)',
            color: 'var(--red)',
            border: '1px solid rgba(248,113,113,0.2)',
          }}
        >
          <Trash2 className="w-4 h-4" />
          {bulkSkipping
            ? 'Bezig met overslaan\u2026'
            : `Sla ${lowCount} vacature${lowCount !== 1 ? 's' : ''} onder ${BULK_SKIP_THRESHOLD}% over`}
        </motion.button>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl px-4 py-3 text-sm"
          style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--red)', border: '1px solid rgba(248,113,113,0.25)' }}>
          {error}
        </div>
      )}

      {/* Loading skeletons */}
      {loading && <SkeletonCards count={3} />}

      {/* Empty state */}
      {!loading && !error && filtered.length === 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-3 py-16 text-center">
          <Briefcase className="w-10 h-10" style={{ color: 'var(--text2)' }} />
          <p className="font-semibold" style={{ color: 'var(--text)' }}>
            {apps.length > 0 ? 'Geen resultaten voor dit filter' : 'Wachtrij is leeg'}
          </p>
          <p className="text-sm max-w-xs" style={{ color: 'var(--text2)' }}>
            {apps.length > 0
              ? 'Pas de filters aan om meer vacatures te zien.'
              : 'Druk op Zoeken op het hoofdscherm om nieuwe vacatures te laden.'}
          </p>
        </motion.div>
      )}

      {/* Cards */}
      <AnimatePresence mode="popLayout">
        {!loading && filtered.map(app => {
          const job  = app.jobs;
          const busy = !!acting[app.id];
          return (
            <motion.div key={app.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -60, scale: 0.95 }}
              transition={{ duration: 0.22 }}
              className="rounded-2xl p-4 flex flex-col gap-3"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}
            >
              {/* Top row: job info + rematch + score */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="font-semibold leading-snug truncate" style={{ color: 'var(--text)' }}>
                    {job?.title ?? 'Onbekende functie'}
                  </span>
                  <span className="flex items-center gap-1 text-sm" style={{ color: 'var(--text2)' }}>
                    <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                    {job?.company ?? '\u2014'}
                    {job?.source && (
                      <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full capitalize"
                        style={{ background: 'var(--surface2)', color: 'var(--text2)' }}>
                        {job.source}
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <RematchButton
                    applicationId={app.id}
                    onRematched={({ match_score, reasoning, cover_letter_draft }) => {
                      setApps(prev => prev.map(a =>
                        a.id === app.id
                          ? { ...a, match_score, reasoning, cover_letter_draft }
                          : a
                      ));
                    }}
                  />
                  <ScoreBadge score={app.match_score} />
                </div>
              </div>

              {/* Reasoning */}
              {app.reasoning && (
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text2)' }}>
                  {app.reasoning}
                </p>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => save(app)}
                  disabled={busy}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-40 active:scale-95"
                  style={{ background: 'rgba(74,222,128,0.15)', color: 'var(--green)', border: '1px solid rgba(74,222,128,0.3)' }}
                >
                  Solliciteer
                </button>
                <button
                  onClick={() => act(app.id, 'skipped')}
                  disabled={busy}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-40 active:scale-95"
                  style={{ background: 'rgba(248,113,113,0.12)', color: 'var(--red)', border: '1px solid rgba(248,113,113,0.25)' }}
                >
                  <XCircle className="w-4 h-4" />
                  Overslaan
                </button>
                {job?.url && (
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0"
                    style={{ background: 'var(--surface2)', color: 'var(--text2)' }}
                    aria-label="Vacature openen"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Apply modal (sheet) */}
      {applyTarget && (
        <ApplyModal
          applicationId={applyTarget.id}
          jobTitle={applyTarget.jobs?.title ?? 'Onbekende functie'}
          company={applyTarget.jobs?.company ?? ''}
          initialLetter={applyTarget.cover_letter_draft ?? null}
          initialBullets={null}
          onClose={() => setApplyTarget(null)}
          onConfirmed={() => { /* card already removed by save() */ }}
        />
      )}

      {/* Manual apply modal */}
      {showManual && (
        <ManualApplyModal
          onClose={() => setShowManual(false)}
          onCreated={load}
        />
      )}
    </main>
  );
}
