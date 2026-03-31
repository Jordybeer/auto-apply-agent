'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, Trash2, RefreshCw, Briefcase, Building2, ChevronDown } from 'lucide-react';
import ScoreBadge from '@/components/ScoreBadge';
import SkeletonCards from '@/components/SkeletonCards';
import RematchButton from '@/components/RematchButton';
import ApplyModal from '@/components/ApplyModal';

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
  cover_letter_draft: string | null;
  resume_bullets_draft: string[] | null;
  contact_person: string | null;
  contact_email: string | null;
  jobs: Job | null;
}

export default function SavedPage() {
  const [apps, setApps]               = useState<Application[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [expanded, setExpanded]       = useState<Record<string, boolean>>({});
  const [applyTarget, setApplyTarget] = useState<Application | null>(null);
  const [acting, setActing]           = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/saved');
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

  // Refresh all scores
  const refreshAll = async () => {
    setRefreshing(true);
    try {
      await Promise.all(
        apps.map(a => fetch('/api/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ application_id: a.id }),
        }))
      );
      await load();
    } catch {
      // partial failure is fine
    } finally {
      setRefreshing(false);
    }
  };

  // Delete: set to skipped so it disappears from saved view
  const remove = async (id: string) => {
    setActing(prev => ({ ...prev, [id]: true }));
    try {
      await fetch('/api/apply', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: id }),
      });
      setApps(prev => prev.filter(a => a.id !== id));
    } finally {
      setActing(prev => ({ ...prev, [id]: false }));
    }
  };

  const toggle = (id: string) =>
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <main className="page-shell flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Bewaard</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text2)' }}>
            {loading ? 'Laden\u2026' : `${apps.length} bewaard`}
          </p>
        </div>
        <button
          onClick={refreshAll}
          disabled={refreshing || loading}
          className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl transition-opacity disabled:opacity-40"
          style={{ background: 'var(--surface2)', color: 'var(--text2)' }}
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Scores herberekenen
        </button>
      </div>

      {error && (
        <div className="rounded-xl px-4 py-3 text-sm"
          style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--red)', border: '1px solid rgba(248,113,113,0.25)' }}>
          {error}
        </div>
      )}

      {loading && <SkeletonCards count={3} />}

      {!loading && !error && apps.length === 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-3 py-16 text-center">
          <Briefcase className="w-10 h-10" style={{ color: 'var(--text2)' }} />
          <p className="font-semibold" style={{ color: 'var(--text)' }}>Niets bewaard</p>
          <p className="text-sm max-w-xs" style={{ color: 'var(--text2)' }}>
            Sla vacatures op via de Wachtrij om ze hier te zien.
          </p>
        </motion.div>
      )}

      <AnimatePresence mode="popLayout">
        {!loading && apps.map(app => {
          const job  = app.jobs;
          const busy = !!acting[app.id];
          const open = !!expanded[app.id];

          return (
            <motion.div key={app.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.22 }}
              className="rounded-2xl p-4 flex flex-col gap-3"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}
            >
              {/* Top row */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="font-semibold leading-snug truncate" style={{ color: 'var(--text)' }}>
                    {job?.title ?? 'Onbekende functie'}
                  </span>
                  <span className="flex items-center gap-1 text-sm" style={{ color: 'var(--text2)' }}>
                    <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                    {job?.company ?? '\u2014'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <RematchButton
                    applicationId={app.id}
                    onRematched={({ match_score, reasoning, cover_letter_draft }) => {
                      setApps(prev => prev.map(a =>
                        a.id === app.id
                          ? { ...a, match_score, reasoning, cover_letter_draft: cover_letter_draft ?? a.cover_letter_draft }
                          : a
                      ));
                    }}
                  />
                  <ScoreBadge score={app.match_score} />
                </div>
              </div>

              {/* Cover letter expandable — motion.div with overflow:hidden to prevent text bleed */}
              {app.cover_letter_draft && (
                <div>
                  <button
                    onClick={() => toggle(app.id)}
                    className="flex items-center gap-1 text-xs font-medium mb-1"
                    style={{ color: 'var(--accent)' }}
                  >
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
                    />
                    {open ? 'Verberg brief' : 'Toon motivatiebrief'}
                  </button>
                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.div
                        key="letter"
                        initial={{ opacity: 0, height: 0, overflow: 'hidden' }}
                        animate={{ opacity: 1, height: 'auto', overflow: 'hidden' }}
                        exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                        transition={{ duration: 0.2 }}
                      >
                        <p className="text-xs leading-relaxed whitespace-pre-line"
                          style={{ color: 'var(--text2)' }}>
                          {app.cover_letter_draft}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setApplyTarget(app)}
                  disabled={busy}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 active:scale-95"
                  style={{ background: 'rgba(74,222,128,0.15)', color: 'var(--green)', border: '1px solid rgba(74,222,128,0.3)' }}
                >
                  Solliciteer
                </button>
                {job?.url && (
                  <a href={job.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0"
                    style={{ background: 'var(--surface2)', color: 'var(--text2)' }}
                    aria-label="Vacature openen">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
                <button
                  onClick={() => remove(app.id)}
                  disabled={busy}
                  className="flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0 disabled:opacity-40"
                  style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--red)' }}
                  aria-label="Verwijderen">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {applyTarget && (
        <ApplyModal
          applicationId={applyTarget.id}
          jobTitle={applyTarget.jobs?.title ?? 'Onbekende functie'}
          company={applyTarget.jobs?.company ?? ''}
          initialLetter={applyTarget.cover_letter_draft}
          initialBullets={applyTarget.resume_bullets_draft}
          onClose={() => setApplyTarget(null)}
          onConfirmed={() => {
            setApps(prev => prev.filter(a => a.id !== applyTarget.id));
            setApplyTarget(null);
          }}
        />
      )}
    </main>
  );
}
