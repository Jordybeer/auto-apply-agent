'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, CheckCircle, XCircle, RefreshCw, Briefcase, Building2 } from 'lucide-react';

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
  jobs: Job | null;
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full font-medium tabular-nums"
        style={{ background: 'var(--surface2)', color: 'var(--text2)' }}>
        ⏳ scoring…
      </span>
    );
  }
  const color = score >= 70 ? 'var(--green)' : score >= 40 ? 'var(--yellow)' : 'var(--red)';
  const bg    = score >= 70 ? 'rgba(74,222,128,0.12)' : score >= 40 ? 'rgba(251,191,36,0.12)' : 'rgba(248,113,113,0.12)';
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-semibold tabular-nums"
      style={{ background: bg, color, border: `1px solid ${color}44` }}>
      {score}%
    </span>
  );
}

export default function QueuePage() {
  const [apps, setApps]       = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [acting, setActing]   = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/queue');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setApps(data.applications ?? []);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load queue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (id: string, status: 'applied' | 'skipped') => {
    setActing(prev => ({ ...prev, [id]: true }));
    try {
      await fetch('/api/queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      setApps(prev => prev.filter(a => a.id !== id));
    } catch {
      // silently keep the card on failure
    } finally {
      setActing(prev => ({ ...prev, [id]: false }));
    }
  };

  return (
    <main className="page-shell flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Wachtrij</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text2)' }}>
            {loading ? 'Laden…' : `${apps.length} vacature${apps.length !== 1 ? 's' : ''} klaar`}
          </p>
        </div>
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

      {/* Error */}
      {error && (
        <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--red)', border: '1px solid rgba(248,113,113,0.25)' }}>
          {error}
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map(i => (
            <motion.div key={i} animate={{ opacity: [0.4, 0.8, 0.4] }} transition={{ repeat: Infinity, duration: 1.4, delay: i * 0.15 }}
              className="rounded-2xl h-32" style={{ background: 'var(--surface)' }} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && apps.length === 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-3 py-16 text-center">
          <Briefcase className="w-10 h-10" style={{ color: 'var(--text2)' }} />
          <p className="font-semibold" style={{ color: 'var(--text)' }}>Wachtrij is leeg</p>
          <p className="text-sm max-w-xs" style={{ color: 'var(--text2)' }}>Druk op Zoeken op het hoofdscherm om nieuwe vacatures te laden.</p>
        </motion.div>
      )}

      {/* Cards */}
      <AnimatePresence mode="popLayout">
        {!loading && apps.map(app => {
          const job = app.jobs;
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
              {/* Job info */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="font-semibold leading-snug truncate" style={{ color: 'var(--text)' }}>
                    {job?.title ?? 'Onbekende functie'}
                  </span>
                  <span className="flex items-center gap-1 text-sm" style={{ color: 'var(--text2)' }}>
                    <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                    {job?.company ?? '—'}
                  </span>
                </div>
                <ScoreBadge score={app.match_score} />
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
                  onClick={() => act(app.id, 'applied')}
                  disabled={busy}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-40 active:scale-95"
                  style={{ background: 'rgba(74,222,128,0.15)', color: 'var(--green)', border: '1px solid rgba(74,222,128,0.3)' }}
                >
                  <CheckCircle className="w-4 h-4" />
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
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </main>
  );
}
