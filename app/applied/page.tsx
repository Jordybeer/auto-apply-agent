'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, RefreshCw, CheckCircle2, Building2, Clock } from 'lucide-react';

interface Job {
  title: string;
  company: string;
  url: string | null;
  source: string | null;
}

interface Application {
  id: string;
  status: string;
  applied_at: string | null;
  match_score: number | null;
  reasoning: string | null;
  cover_letter_draft: string | null;
  jobs: Job | null;
}

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  applied:     { label: 'Gesolliciteerd', color: 'var(--green)',  bg: 'rgba(74,222,128,0.12)'  },
  in_progress: { label: 'In behandeling', color: 'var(--yellow)', bg: 'rgba(251,191,36,0.12)'  },
  rejected:    { label: 'Afgewezen',      color: 'var(--red)',    bg: 'rgba(248,113,113,0.12)' },
};

function relativeTime(iso: string | null) {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return 'zojuist';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m geleden`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}u geleden`;
  return `${Math.floor(diff / 86400)}d geleden`;
}

export default function AppliedPage() {
  const [apps, setApps]       = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [acting, setActing]   = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/applied');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setApps(data.applications ?? []);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id: string, status: string) => {
    setActing(prev => ({ ...prev, [id]: true }));
    try {
      await fetch('/api/applied', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: id, status }),
      });
      setApps(prev => prev.map(a => a.id === id ? { ...a, status } : a));
    } catch {} finally {
      setActing(prev => ({ ...prev, [id]: false }));
    }
  };

  return (
    <main className="page-shell flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Gesolliciteerd</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text2)' }}>
            {loading ? 'Laden\u2026' : `${apps.length} sollicitatie${apps.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl transition-opacity disabled:opacity-40"
          style={{ background: 'var(--surface2)', color: 'var(--text2)' }}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Vernieuwen
        </button>
      </div>

      {error && (
        <div className="rounded-xl px-4 py-3 text-sm"
          style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--red)', border: '1px solid rgba(248,113,113,0.25)' }}>
          {error}
        </div>
      )}

      {loading && (
        <div className="flex flex-col gap-3">
          {[1,2,3].map(i => (
            <motion.div key={i} animate={{ opacity: [0.4,0.8,0.4] }} transition={{ repeat: Infinity, duration: 1.4, delay: i*0.15 }}
              className="rounded-2xl h-28" style={{ background: 'var(--surface)' }} />
          ))}
        </div>
      )}

      {!loading && !error && apps.length === 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-3 py-16 text-center">
          <CheckCircle2 className="w-10 h-10" style={{ color: 'var(--text2)' }} />
          <p className="font-semibold" style={{ color: 'var(--text)' }}>Nog geen sollicitaties</p>
          <p className="text-sm max-w-xs" style={{ color: 'var(--text2)' }}>Vacatures waar je op solliciteert verschijnen hier.</p>
        </motion.div>
      )}

      <AnimatePresence mode="popLayout">
        {!loading && apps.map(app => {
          const job    = app.jobs;
          const busy   = !!acting[app.id];
          const open   = expanded === app.id;
          const st     = STATUS_LABEL[app.status] ?? STATUS_LABEL.applied;
          return (
            <motion.div key={app.id}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.22 }}
              className="rounded-2xl p-4 flex flex-col gap-3"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>

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
                <span className="flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-semibold"
                  style={{ background: st.bg, color: st.color, border: `1px solid ${st.color}44` }}>
                  {st.label}
                </span>
              </div>

              {app.applied_at && (
                <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text2)' }}>
                  <Clock className="w-3 h-3" />
                  {relativeTime(app.applied_at)}
                </span>
              )}

              {app.reasoning && (
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text2)' }}>{app.reasoning}</p>
              )}

              {app.cover_letter_draft && (
                <div>
                  <button onClick={() => setExpanded(open ? null : app.id)}
                    className="text-xs font-medium" style={{ color: 'var(--accent)' }}>
                    {open ? 'Verberg motivatiebrief' : 'Toon motivatiebrief'}
                  </button>
                  {open && (
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="text-xs leading-relaxed mt-2 whitespace-pre-wrap"
                      style={{ color: 'var(--text3)', borderLeft: '2px solid var(--border)', paddingLeft: '0.75rem' }}>
                      {app.cover_letter_draft}
                    </motion.p>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                {app.status === 'applied' && (
                  <button onClick={() => updateStatus(app.id, 'in_progress')} disabled={busy}
                    className="flex-1 py-2.5 rounded-xl text-xs font-semibold disabled:opacity-40 active:scale-95"
                    style={{ background: 'rgba(251,191,36,0.12)', color: 'var(--yellow)', border: '1px solid rgba(251,191,36,0.3)' }}>
                    In behandeling
                  </button>
                )}
                {app.status !== 'rejected' && (
                  <button onClick={() => updateStatus(app.id, 'rejected')} disabled={busy}
                    className="flex-1 py-2.5 rounded-xl text-xs font-semibold disabled:opacity-40 active:scale-95"
                    style={{ background: 'rgba(248,113,113,0.12)', color: 'var(--red)', border: '1px solid rgba(248,113,113,0.25)' }}>
                    Afgewezen
                  </button>
                )}
                {job?.url && (
                  <a href={job.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0"
                    style={{ background: 'var(--surface2)', color: 'var(--text2)' }}>
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
