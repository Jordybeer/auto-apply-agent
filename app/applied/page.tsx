'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, RefreshCw, Briefcase, Building2, FileDown, Trash2 } from 'lucide-react';
import ScoreBadge from '@/components/ScoreBadge';
import SkeletonCards from '@/components/SkeletonCards';
import StatusPicker from '@/components/StatusPicker';
import RematchButton from '@/components/RematchButton';

type AppStatus = 'applied' | 'in_progress' | 'rejected' | 'accepted';

interface Job {
  title: string;
  company: string;
  url: string | null;
  source: string | null;
}

interface Application {
  id: string;
  status: AppStatus;
  match_score: number | null;
  reasoning: string | null;
  cover_letter_draft: string | null;
  applied_at: string | null;
  contact_person: string | null;
  contact_email: string | null;
  jobs: Job | null;
}

export default function AppliedPage() {
  const [apps, setApps]             = useState<Application[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [acting, setActing]         = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/applied');
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

  const refreshAll = async () => {
    setRefreshing(true);
    try {
      await Promise.all(
        apps.map(a => fetch('/api/rematch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ application_id: a.id }),
        }))
      );
      await load();
    } catch {}
    finally { setRefreshing(false); }
  };

  // PATCH — uses application_id to match route expectation
  const updateStatus = async (id: string, status: AppStatus) => {
    setApps(prev => prev.map(a => a.id === id ? { ...a, status } : a));
    try {
      const res = await fetch('/api/applied', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: id, status }),
      });
      if (!res.ok) await load(); // revert on server error
    } catch {
      await load();
    }
  };

  // DELETE — uses application_id to match route expectation
  const remove = async (id: string) => {
    setActing(prev => ({ ...prev, [id]: true }));
    try {
      await fetch('/api/applied', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: id }),
      });
      setApps(prev => prev.filter(a => a.id !== id));
    } finally {
      setActing(prev => ({ ...prev, [id]: false }));
    }
  };

  const exportPDF = () => {
    const rows = apps.map(a => `
      <tr>
        <td>${a.jobs?.title ?? '-'}</td>
        <td>${a.jobs?.company ?? '-'}</td>
        <td>${a.applied_at ? new Date(a.applied_at).toLocaleDateString('nl-BE') : '-'}</td>
        <td>${a.status}</td>
        <td>${a.match_score != null ? a.match_score + '%' : '-'}</td>
      </tr>`).join('');
    const html = `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8">
      <title>Sollicitaties export</title>
      <style>body{font-family:sans-serif;padding:2rem}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:.5rem .75rem;text-align:left}th{background:#f5f5f5}@media print{body{padding:0}}</style></head>
      <body><h1>Sollicitaties</h1><p>Export: ${new Date().toLocaleDateString('nl-BE')}</p>
      <table><thead><tr><th>Functie</th><th>Bedrijf</th><th>Datum</th><th>Status</th><th>Score</th></tr></thead>
      <tbody>${rows}</tbody></table></body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `sollicitaties-${new Date().toISOString().slice(0, 10)}.html`;
    a.click(); URL.revokeObjectURL(url);
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
        <div className="flex items-center gap-2">
          {!loading && apps.length > 0 && (
            <button onClick={exportPDF}
              className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl"
              style={{ background: 'var(--surface2)', color: 'var(--text2)' }}>
              <FileDown className="w-4 h-4" /> Export
            </button>
          )}
          <button onClick={refreshAll} disabled={refreshing || loading}
            className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl disabled:opacity-40"
            style={{ background: 'var(--surface2)', color: 'var(--text2)' }}>
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Scores
          </button>
        </div>
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
          <p className="font-semibold" style={{ color: 'var(--text)' }}>Nog niet gesolliciteerd</p>
          <p className="text-sm max-w-xs" style={{ color: 'var(--text2)' }}>
            Bevestig een sollicitatie via Bewaard om ze hier te zien.
          </p>
        </motion.div>
      )}

      <AnimatePresence mode="popLayout">
        {!loading && apps.map(app => {
          const job  = app.jobs;
          const busy = !!acting[app.id];
          return (
            <motion.div key={app.id}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.22 }}
              className="rounded-2xl p-4 flex flex-col gap-3"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="font-semibold leading-snug truncate" style={{ color: 'var(--text)' }}>
                    {job?.title ?? 'Onbekende functie'}
                  </span>
                  <span className="flex items-center gap-1 text-sm" style={{ color: 'var(--text2)' }}>
                    <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                    {job?.company ?? '\u2014'}
                    {app.applied_at && (
                      <span className="ml-2 text-xs" style={{ color: 'var(--text2)' }}>
                        {new Date(app.applied_at).toLocaleDateString('nl-BE')}
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <RematchButton
                    applicationId={app.id}
                    onRematched={({ match_score, reasoning }) =>
                      setApps(prev => prev.map(a => a.id === app.id ? { ...a, match_score, reasoning } : a))
                    }
                  />
                  <ScoreBadge score={app.match_score} />
                </div>
              </div>

              <StatusPicker value={app.status} onChange={(s: AppStatus) => updateStatus(app.id, s)} />

              {(app.contact_person || app.contact_email) && (
                <p className="text-xs" style={{ color: 'var(--text2)' }}>
                  {app.contact_person && <span>{app.contact_person} </span>}
                  {app.contact_email && (
                    <a href={`mailto:${app.contact_email}`} className="underline" style={{ color: 'var(--accent)' }}>
                      {app.contact_email}
                    </a>
                  )}
                </p>
              )}

              <div className="flex items-center gap-2">
                {job?.url && (
                  <a href={job.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 flex-1 justify-center py-2 rounded-xl text-sm"
                    style={{ background: 'var(--surface2)', color: 'var(--text2)' }}>
                    <ExternalLink className="w-3.5 h-3.5" /> Bekijk vacature
                  </a>
                )}
                <button onClick={() => remove(app.id)} disabled={busy}
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
    </main>
  );
}
