'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ExternalLink, XCircle, RefreshCw, Building2, PlusCircle,
  Trash2, MapPin, Bookmark, FileText, X, Loader2, Send,
  FileDown, PencilLine, Filter, AlertTriangle,
} from 'lucide-react';
import ScoreBadge from '@/components/ScoreBadge';
import SkeletonCards from '@/components/SkeletonCards';
import ApplyModal from '@/components/ApplyModal';
import ManualApplyModal from '@/components/ManualApplyModal';
import RematchButton from '@/components/RematchButton';
import StatusPicker from '@/components/StatusPicker';
import aiJobScreeningData from '@/app/lotties/Ai Job Screening.json';
import sparklesJson from '@/app/lotties/sparkles.json';

const Lottie = dynamic(() => import('lottie-react'), { ssr: false });

type AppStatus = 'applied' | 'in_progress' | 'rejected' | 'accepted';

interface Job {
  title: string;
  company: string;
  url: string | null;
  source: string | null;
  description: string | null;
  location: string | null;
}

interface Application {
  id: string;
  status: string;
  match_score: number | null;
  reasoning: string | null;
  cover_letter_draft?: string | null;
  applied_at?: string | null;
  contact_person?: string | null;
  contact_email?: string | null;
  note?: string | null;
  sent_via_email?: boolean | null;
  jobs: Job | null;
}

type Tab = 'queue' | 'saved' | 'applied';
type ScoreFilter = 'all' | 'high' | 'mid' | 'low';

const SCORE_FILTERS: { key: ScoreFilter; label: string }[] = [
  { key: 'all',  label: 'Alles' },
  { key: 'high', label: '≥75%' },
  { key: 'mid',  label: '50–74%' },
  { key: 'low',  label: '<50%' },
];

const TAB_CONFIG: { key: Tab; label: string; accent: string; accentBg: string; accentBorder: string }[] = [
  { key: 'queue',   label: 'Wachtrij',      accent: '#6366f1', accentBg: 'rgba(99,102,241,0.15)',  accentBorder: 'rgba(99,102,241,0.3)' },
  { key: 'saved',   label: 'Bewaard',        accent: '#f59e0b', accentBg: 'rgba(245,158,11,0.15)', accentBorder: 'rgba(245,158,11,0.3)' },
  { key: 'applied', label: 'Gesolliciteerd', accent: '#22c55e', accentBg: 'rgba(34,197,94,0.15)',  accentBorder: 'rgba(34,197,94,0.3)' },
];

const STATUS_BORDER: Record<string, string> = {
  applied:     'rgba(74,222,128,0.7)',
  in_progress: 'rgba(251,191,36,0.7)',
  rejected:    'rgba(248,113,113,0.7)',
  accepted:    'rgba(99,102,241,0.7)',
};

const STATUS_ORDER: Record<string, number> = {
  in_progress: 0, applied: 1, accepted: 2, rejected: 3,
};

function sortApplied(list: Application[]) {
  return [...list].sort((a, b) => {
    const diff = (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
    if (diff !== 0) return diff;
    return (b.applied_at ?? '').localeCompare(a.applied_at ?? '');
  });
}

function matchesScore(score: number | null, filter: ScoreFilter) {
  if (filter === 'all' || score === null) return true;
  if (filter === 'high') return score >= 75;
  if (filter === 'mid')  return score >= 50 && score < 75;
  return score < 50;
}

const BULK_SKIP_THRESHOLD = 40;
const CLEAR_LOW_THRESHOLD = 50;

const iconBtn = (bg: string, color: string, border: string) =>
  ({ background: bg, color, border: `1px solid ${border}` });

const labelBtn = (bg: string, color: string, border: string) =>
  ({ background: bg, color, border: `1px solid ${border}` });

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------
interface ToastMessage {
  id: number;
  text: string;
  action?: { label: string; onClick: () => void };
}

let _toastId = 0;

function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const t = timers.current.get(id);
    if (t) { clearTimeout(t); timers.current.delete(id); }
  }, []);

  const show = useCallback((text: string, action?: ToastMessage['action'], duration = 5000) => {
    const id = ++_toastId;
    setToasts(prev => [...prev, { id, text, action }]);
    const t = setTimeout(() => dismiss(id), duration);
    timers.current.set(id, t);
  }, [dismiss]);

  return { toasts, show, dismiss };
}

function ToastContainer({ toasts, dismiss }: { toasts: ToastMessage[]; dismiss: (id: number) => void }) {
  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 items-center pointer-events-none w-full px-4 max-w-sm">
      <AnimatePresence>
        {toasts.map(t => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ type: 'spring', damping: 28, stiffness: 340 }}
            className="pointer-events-auto flex items-center gap-2 w-full rounded-2xl px-4 py-3.5 shadow-xl"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border-bright)',
              color: 'var(--text)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              boxShadow: 'var(--shadow)',
            }}
          >
            <span className="flex-1 leading-snug text-sm font-medium">{t.text}</span>
            {t.action && (
              <button
                onClick={() => { t.action!.onClick(); dismiss(t.id); }}
                className="text-xs font-bold px-3 py-1.5 rounded-xl flex-shrink-0 active:scale-95"
                style={{
                  background: 'rgba(99,102,241,0.25)',
                  color: '#a5b4fc',
                  border: '1px solid rgba(99,102,241,0.4)',
                }}
              >
                {t.action.label}
              </button>
            )}
            <button
              onClick={() => dismiss(t.id)}
              className="flex-shrink-0 flex items-center justify-center rounded-xl active:scale-90"
              style={{ width: 44, height: 44, color: 'var(--text3)', margin: '-6px -8px -6px 0' }}
              aria-label="Sluiten"
            >
              <X className="w-5 h-5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NoteSheet
// ---------------------------------------------------------------------------
interface NoteSheetProps {
  app: Application;
  onClose: () => void;
  onSaved: (id: string, note: string) => void;
}

function NoteSheet({ app, onClose, onSaved }: NoteSheetProps) {
  const [note, setNote]     = useState(app.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  // Sync when app prop changes (safety net — key prop on the parent handles the primary reset)
  useEffect(() => {
    setNote(app.note ?? '');
    setError(null);
  }, [app.id]);

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/applied', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: app.id, note }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      onSaved(app.id, note);
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        key="note-overlay"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end justify-center"
        style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      >
        <motion.div
          key="note-sheet"
          initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
          transition={{ type: 'spring' as const, damping: 28, stiffness: 320 }}
          className="w-full max-w-lg rounded-t-3xl flex flex-col gap-4 p-5 pb-8"
          style={{ background: 'var(--surface)', maxHeight: '80dvh', overflowY: 'auto' }}
          onClick={e => e.stopPropagation()}
        >
          <div className="mx-auto w-10 h-1 rounded-full" style={{ background: 'var(--border)' }} />

          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="font-bold text-base leading-snug" style={{ color: 'var(--text)' }}>Notitie</span>
              <span className="text-sm" style={{ color: 'var(--text2)' }}>
                {app.jobs?.title ?? 'Onbekende functie'} — {app.jobs?.company ?? ''}
              </span>
            </div>
            <button onClick={onClose}
              className="flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center"
              style={{ background: 'var(--surface2)' }} aria-label="Sluiten">
              <X className="w-5 h-5" style={{ color: 'var(--text2)' }} />
            </button>
          </div>

          <textarea
            autoFocus
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={6}
            placeholder="Gesprek op 5 april, contactpersoon is Sarah, tweede ronde verwacht…"
            className="w-full rounded-2xl p-3.5 text-sm resize-none leading-relaxed focus:outline-none"
            style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}
          />

          {error && (
            <div className="text-xs rounded-xl px-3 py-2"
              style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--red)', border: '1px solid rgba(248,113,113,0.25)' }}>
              {error}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button onClick={onClose} disabled={saving}
              className="flex-1 py-3 rounded-2xl text-sm font-semibold disabled:opacity-40"
              style={{ background: 'var(--surface2)', color: 'var(--text2)' }}>Annuleer</button>
            <button onClick={save} disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold disabled:opacity-40 active:scale-95"
              style={{ background: 'var(--color-primary, #6366f1)', color: '#fff' }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Opslaan
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
export default function QueueContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const activeTab = ((searchParams.get('tab') as Tab | null) ?? 'queue');

  const [apps, setApps]                   = useState<Application[]>([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);
  const [acting, setActing]               = useState<Record<string, boolean>>({});
  const [scoreFilter, setScoreFilter]     = useState<ScoreFilter>('all');
  const [sourceFilter, setSourceFilter]   = useState<string>('all');
  const [applyTarget, setApplyTarget]     = useState<Application | null>(null);
  const [noteTarget, setNoteTarget]       = useState<Application | null>(null);
  const [showManual, setShowManual]       = useState(false);
  const [bulkSkipping, setBulkSkipping]   = useState(false);
  const [clearingLow, setClearingLow]     = useState(false);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [counts, setCounts]               = useState<Record<Tab, number>>({ queue: 0, saved: 0, applied: 0 });
  const [lottieReady, setLottieReady]     = useState(false);

  const { toasts, show: showToast, dismiss: dismissToast } = useToast();

  useEffect(() => { setLottieReady(true); }, []);

  useEffect(() => {
    setScoreFilter('all');
    setSourceFilter('all');
  }, [activeTab]);

  const switchTab = (tab: Tab) => {
    router.replace(`/queue?tab=${tab}`, { scroll: false });
  };

  const activeConfig = TAB_CONFIG.find(t => t.key === activeTab)!;

  const load = useCallback(async (tab: Tab) => {
    setLoading(true); setError(null);
    try {
      const apiRoute = tab === 'queue' ? '/api/queue' : `/api/${tab}`;
      const res = await fetch(apiRoute);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const raw = data.applications ?? data.items ?? [];
      setApps(tab === 'applied' ? sortApplied(raw) : raw);

      const [qRes, sRes, aRes] = await Promise.allSettled([
        fetch('/api/queue').then(r => r.json()),
        fetch('/api/saved').then(r => r.json()),
        fetch('/api/applied').then(r => r.json()),
      ]);
      setCounts({
        queue:   qRes.status === 'fulfilled' ? (qRes.value.applications ?? []).length : 0,
        saved:   sRes.status === 'fulfilled' ? (sRes.value.applications ?? sRes.value.items ?? []).length : 0,
        applied: aRes.status === 'fulfilled' ? (aRes.value.applications ?? aRes.value.items ?? []).length : 0,
      });
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Laden mislukt');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(activeTab); }, [activeTab, load]);

  const updateStatus = async (id: string, status: string) => {
    setApps(prev => sortApplied(prev.map(a => a.id === id ? { ...a, status } : a)));
    try {
      const res = await fetch('/api/applied', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: id, status }),
      });
      if (!res.ok) await load('applied');
    } catch { await load('applied'); }
  };

  const removeApplied = async (id: string) => {
    setActing(prev => ({ ...prev, [id]: true }));
    try {
      await fetch('/api/applied', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: id }),
      });
      setApps(prev => prev.filter(a => a.id !== id));
      setCounts(prev => ({ ...prev, applied: Math.max(0, prev.applied - 1) }));
    } finally {
      setActing(prev => ({ ...prev, [id]: false }));
    }
  };

  const unsaveSaved = async (id: string) => {
    setActing(prev => ({ ...prev, [id]: true }));
    try {
      await fetch('/api/saved', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: id }),
      });
      setApps(prev => prev.filter(a => a.id !== id));
      setCounts(prev => ({ ...prev, saved: Math.max(0, prev.saved - 1) }));
    } finally {
      setActing(prev => ({ ...prev, [id]: false }));
    }
  };

  const refreshAllScores = async () => {
    setRefreshingAll(true);
    try {
      await Promise.all(apps.map(a =>
        fetch('/api/rematch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ application_id: a.id }),
        })
      ));
      await load(activeTab);
    } catch {}
    finally { setRefreshingAll(false); }
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

  const clearLowCount = useMemo(() => apps.filter(a =>
    a.match_score !== null && a.match_score < CLEAR_LOW_THRESHOLD
  ).length, [apps]);

  const zeroScoreCount = useMemo(() => apps.filter(a => a.match_score === null).length, [apps]);

  const act = async (id: string, status: 'saved' | 'skipped') => {
    setActing(prev => ({ ...prev, [id]: true }));
    try {
      await fetch('/api/queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      setApps(prev => prev.filter(a => a.id !== id));
      setCounts(prev => ({
        ...prev,
        queue: Math.max(0, prev.queue - 1),
        ...(status === 'saved' ? { saved: prev.saved + 1 } : {}),
      }));
    } catch {}
    finally { setActing(prev => ({ ...prev, [id]: false })); }
  };

  const saveOnly     = async (id: string) => { await act(id, 'saved'); };
  const saveAndApply = async (app: Application) => { await act(app.id, 'saved'); setApplyTarget(app); };

  const bulkSkipLow = async () => {
    if (bulkSkipping) return;
    setBulkSkipping(true);
    const low = apps.filter(a => a.match_score !== null && a.match_score < BULK_SKIP_THRESHOLD);
    await Promise.all(low.map(a => act(a.id, 'skipped')));
    setBulkSkipping(false);
  };

  const clearLowScores = async () => {
    if (clearingLow) return;
    const low = apps.filter(a => a.match_score !== null && a.match_score < CLEAR_LOW_THRESHOLD);
    if (low.length === 0) return;
    setClearingLow(true);
    try {
      if (activeTab === 'queue') {
        await Promise.all(low.map(a =>
          fetch('/api/queue', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: a.id, status: 'skipped' }),
          })
        ));
      } else {
        await Promise.all(low.map(a =>
          fetch('/api/saved', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ application_id: a.id }),
          })
        ));
      }
      setApps(prev => prev.filter(a => !(a.match_score !== null && a.match_score < CLEAR_LOW_THRESHOLD)));
      setCounts(prev => ({
        ...prev,
        [activeTab]: Math.max(0, prev[activeTab as Tab] - low.length),
      }));
      showToast(`✓ ${low.length} lage score${low.length !== 1 ? 's' : ''} verwijderd.`);
      if (zeroScoreCount > 0) {
        showToast(
          `${zeroScoreCount} vacature${zeroScoreCount !== 1 ? 's' : ''} zonder score — herbereken om alles bij te werken.`,
          { label: 'Herbereken', onClick: refreshAllScores },
        );
      }
    } finally {
      setClearingLow(false);
    }
  };

  const confirmClearLow = () => {
    showToast(
      `${clearLowCount} vacature${clearLowCount !== 1 ? 's' : ''} onder 50% verwijderen?`,
      { label: 'Bevestig', onClick: clearLowScores },
      8000,
    );
  };

  const handleRematched = (id: string, data: { match_score: number; reasoning: string; cover_letter_draft: string }) => {
    setApps(prev => prev.map(a =>
      a.id === id
        ? { ...a, match_score: data.match_score, reasoning: data.reasoning, cover_letter_draft: data.cover_letter_draft }
        : a
    ));
  };

  const emptyTitle =
    apps.length > 0 ? 'Geen resultaten voor dit filter'
    : activeTab === 'queue'   ? 'Wachtrij is leeg'
    : activeTab === 'saved'   ? 'Nog niets bewaard'
    : 'Nog niet gesolliciteerd';

  const emptySub =
    apps.length > 0 ? 'Pas de filters aan of wacht op nieuwe vacatures.'
    : activeTab === 'queue'   ? 'Druk op Zoeken op het hoofdscherm om nieuwe vacatures te laden.'
    : activeTab === 'saved'   ? 'Sla vacatures op vanuit de wachtrij om ze hier te zien.'
    : 'Gesolliciteerde vacatures verschijnen hier automatisch.';

  const iconBtnClass = 'flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-xl disabled:opacity-40 active:scale-95 transition-transform';
  const labelBtnClass = 'flex-shrink-0 flex items-center gap-1.5 px-3 h-8 rounded-xl text-xs font-semibold disabled:opacity-40 active:scale-95 transition-transform';

  return (
    <main className="page-shell flex flex-col gap-5">

      {/* Tab switcher */}
      <div
        className="flex items-center rounded-2xl p-1 gap-1 relative"
        style={{ background: 'var(--surface2)' }}
        role="tablist" aria-label="Navigatie"
      >
        {TAB_CONFIG.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => switchTab(tab.key)}
              className="relative flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold"
              style={{ color: isActive ? tab.accent : 'var(--text2)', isolation: 'isolate' }}
            >
              {isActive && (
                <motion.span
                  layoutId="tab-pill"
                  className="absolute inset-0 rounded-xl"
                  style={{
                    background: tab.accentBg,
                    border: `1px solid ${tab.accentBorder}`,
                    zIndex: 0,
                    pointerEvents: 'none',
                  }}
                  transition={{ type: 'spring' as const, damping: 26, stiffness: 380 }}
                />
              )}
              <span className="relative flex items-center gap-1.5" style={{ zIndex: 1 }}>
                {tab.label}
                {counts[tab.key] > 0 && (
                  <motion.span
                    key={`${tab.key}-${counts[tab.key]}`}
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold px-1"
                    style={{
                      background: isActive ? tab.accent : 'var(--border)',
                      color: isActive ? '#fff' : 'var(--text2)',
                    }}
                  >
                    {counts[tab.key]}
                  </motion.span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>
            {activeConfig.label}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text2)' }}>
            {loading ? 'Laden…' : `${filtered.length} van ${apps.length} vacature${apps.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'queue' && (
            <button onClick={() => setShowManual(true)}
              className="flex items-center justify-center w-9 h-9 rounded-xl"
              style={{ background: 'var(--surface2)', color: 'var(--accent)' }}
              aria-label="Manueel toevoegen">
              <PlusCircle className="w-5 h-5" />
            </button>
          )}
          {activeTab === 'applied' && !loading && apps.length > 0 && (
            <button onClick={exportPDF}
              className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl"
              style={{ background: 'var(--surface2)', color: 'var(--text2)' }}>
              <FileDown className="w-4 h-4" /> Export
            </button>
          )}
          {!loading && apps.length > 0 && (
            <button onClick={refreshAllScores} disabled={refreshingAll}
              className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl disabled:opacity-40"
              style={{ background: 'var(--surface2)', color: 'var(--text2)' }}>
              <RefreshCw className={`w-4 h-4 ${refreshingAll ? 'animate-spin' : ''}`} />
              Herbereken scores
            </button>
          )}
        </div>
      </div>

      {(activeTab === 'queue' || activeTab === 'saved') && !loading && apps.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {SCORE_FILTERS.map(f => (
            <button key={f.key} onClick={() => setScoreFilter(f.key)}
              className="text-xs px-3 py-1 rounded-full font-medium transition-colors"
              style={{
                background: scoreFilter === f.key ? 'var(--accent)' : 'var(--surface2)',
                color: scoreFilter === f.key ? '#fff' : 'var(--text2)',
              }}>
              {f.label}
            </button>
          ))}
          {sources.length > 2 && sources.map(s => (
            <button key={s} onClick={() => setSourceFilter(s)}
              className="text-xs px-3 py-1 rounded-full font-medium transition-colors capitalize"
              style={{
                background: sourceFilter === s ? 'var(--accent)' : 'var(--surface2)',
                color: sourceFilter === s ? '#fff' : 'var(--text2)',
              }}>
              {s === 'all' ? 'Alle bronnen' : s}
            </button>
          ))}

          {activeTab === 'queue' && lowCount >= 3 && (
            <button onClick={bulkSkipLow} disabled={bulkSkipping}
              className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-full font-medium ml-auto disabled:opacity-40"
              style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--red)', border: '1px solid rgba(248,113,113,0.2)' }}>
              {bulkSkipping ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
              Skip alle &lt;{BULK_SKIP_THRESHOLD}% ({lowCount})
            </button>
          )}

          {clearLowCount > 0 && (
            <button
              onClick={confirmClearLow}
              disabled={clearingLow}
              className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-full font-medium disabled:opacity-40"
              style={{
                background: 'rgba(248,113,113,0.08)',
                color: 'var(--red)',
                border: '1px solid rgba(248,113,113,0.18)',
                marginLeft: activeTab === 'saved' ? 'auto' : undefined,
              }}
            >
              {clearingLow
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <Filter className="w-3 h-3" />
              }
              Wis lage scores ({clearLowCount})
            </button>
          )}
        </div>
      )}

      <AnimatePresence>
        {(activeTab === 'queue' || activeTab === 'saved') && !loading && clearLowCount > 0 && (
          <motion.div
            key="low-score-banner"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ type: 'spring', damping: 28, stiffness: 340 }}
            className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm"
            style={{
              background: 'rgba(248,113,113,0.07)',
              border: '1px solid rgba(248,113,113,0.2)',
              color: 'var(--red)',
            }}
          >
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1 leading-snug font-medium">
              {clearLowCount} vacature{clearLowCount !== 1 ? 's' : ''} met een score onder 50% — waarschijnlijk geen goede match.
            </span>
            <button
              onClick={confirmClearLow}
              disabled={clearingLow}
              className="flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-xl disabled:opacity-40 active:scale-95"
              style={{ background: 'rgba(248,113,113,0.15)', color: 'var(--red)', border: '1px solid rgba(248,113,113,0.25)' }}
            >
              {clearingLow ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Wis alles'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {loading && <SkeletonCards count={4} />}

      {!loading && error && (
        <div className="text-sm rounded-2xl px-4 py-3"
          style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--red)', border: '1px solid rgba(248,113,113,0.2)' }}>
          {error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          {lottieReady && apps.length === 0 && activeTab === 'queue' ? (
            <div className="w-40 h-40">
              <Lottie animationData={aiJobScreeningData} loop autoplay />
            </div>
          ) : (
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--surface2)' }}>
              <Building2 className="w-6 h-6" style={{ color: 'var(--text2)' }} />
            </div>
          )}
          <div>
            <p className="font-semibold text-base" style={{ color: 'var(--text)' }}>{emptyTitle}</p>
            <p className="text-sm mt-1 max-w-xs mx-auto" style={{ color: 'var(--text2)' }}>{emptySub}</p>
          </div>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <AnimatePresence mode="popLayout">
          {filtered.map((app, i) => {
            const busy      = acting[app.id] ?? false;
            const job       = app.jobs;
            const isApplied = activeTab === 'applied';
            const isSaved   = activeTab === 'saved';
            const isQueue   = activeTab === 'queue';

            return (
              <motion.div
                key={app.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: Math.min(i * 0.04, 0.3), duration: 0.22 }}
                className="glass-card glass-highlight relative rounded-2xl p-4 flex flex-col gap-3 overflow-hidden"
                style={isApplied ? { borderColor: STATUS_BORDER[app.status] ?? 'var(--border)' } : undefined}
              >
                {/* Header row */}
                <div className="relative z-10 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 flex-wrap">
                      <span className="font-semibold text-sm leading-snug" style={{ color: 'var(--text)' }}>
                        {job?.title ?? 'Onbekende functie'}
                      </span>
                      {app.match_score !== null && <ScoreBadge score={app.match_score} />}
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs flex items-center gap-1">
                        <Building2 className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--blue)' }} />
                        <span style={{ color: 'var(--text2)' }}>{job?.company ?? '—'}</span>
                      </span>
                      {job?.location && (
                        <span className="text-xs flex items-center gap-1">
                          <MapPin className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--teal)' }} />
                          <span style={{ color: 'var(--text2)' }}>{job.location}</span>
                        </span>
                      )}
                      {job?.source && (
                        <span
                          className="text-xs px-1.5 py-0.5 rounded-full capitalize font-medium"
                          style={{
                            background: 'var(--accent-dim)',
                            color: 'var(--accent-bright)',
                            border: '1px solid rgba(129,140,248,0.18)',
                          }}
                        >
                          {job.source}
                        </span>
                      )}
                    </div>
                  </div>

                  {(isQueue || isSaved) && (
                    <RematchButton
                      applicationId={app.id}
                      onRematched={(data) => handleRematched(app.id, data)}
                    />
                  )}
                </div>

                {app.reasoning && (
                  <div
                    className="relative z-10 overflow-y-auto rounded-xl px-3 py-2"
                    style={{ maxHeight: '5.5rem', background: 'var(--surface2)', border: '1px solid var(--border)' }}
                  >
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text2)' }}>
                      {app.reasoning}
                    </p>
                  </div>
                )}

                {(app.contact_person || app.contact_email) && (
                  <div className="relative z-10 flex items-center gap-3 flex-wrap">
                    {app.contact_person && (
                      <span className="text-xs" style={{ color: 'var(--text2)' }}>👤 {app.contact_person}</span>
                    )}
                    {app.contact_email && (
                      <a href={`mailto:${app.contact_email}`} className="text-xs underline" style={{ color: 'var(--accent)' }}>
                        {app.contact_email}
                      </a>
                    )}
                  </div>
                )}

                {app.note && (
                  <div className="relative z-10 text-xs rounded-xl px-3 py-2 leading-relaxed"
                    style={{ background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }}>
                    {app.note}
                  </div>
                )}

                {/* ── Action row — queue tab ── */}
                {isQueue && (
                  <div className="relative z-10 flex items-center gap-2 pt-1" style={{ borderTop: '1px solid var(--divider)' }}>
                    <div className="flex items-center gap-2">
                      <button onClick={() => saveOnly(app.id)} disabled={busy}
                        className={labelBtnClass}
                        style={labelBtn('rgba(245,158,11,0.08)', '#f59e0b', 'rgba(245,158,11,0.2)')}>
                        <Bookmark className="w-3.5 h-3.5" />
                        Bewaar
                      </button>
                      <button onClick={() => saveAndApply(app)} disabled={busy}
                        className={labelBtnClass}
                        style={labelBtn('rgba(99,102,241,0.1)', '#6366f1', 'rgba(99,102,241,0.2)')}>
                        <Send className="w-3.5 h-3.5" />
                        Solliciteer
                      </button>
                    </div>
                    <div className="flex items-center gap-2 ml-auto">
                      {job?.url && (
                        <a href={job.url} target="_blank" rel="noopener noreferrer"
                          className={iconBtnClass}
                          style={iconBtn('var(--surface2)', 'var(--text2)', 'var(--border)')}
                          aria-label="Open vacature">
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                      <button onClick={() => act(app.id, 'skipped')} disabled={busy}
                        className={iconBtnClass}
                        style={iconBtn('rgba(248,113,113,0.08)', 'var(--red)', 'rgba(248,113,113,0.2)')}
                        aria-label="Skip">
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Action row — saved tab ── */}
                {isSaved && (
                  <div className="relative z-10 flex items-center gap-2 pt-1" style={{ borderTop: '1px solid var(--divider)' }}>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setApplyTarget(app)} disabled={busy}
                        className={labelBtnClass}
                        style={labelBtn('rgba(99,102,241,0.1)', '#6366f1', 'rgba(99,102,241,0.2)')}>
                        <Send className="w-3.5 h-3.5" />
                        Solliciteer
                      </button>
                      <button onClick={() => setApplyTarget(app)} disabled={busy}
                        className={iconBtnClass}
                        style={iconBtn('rgba(99,102,241,0.08)', '#6366f1', 'rgba(99,102,241,0.15)')}
                        aria-label="Motivatiebrief">
                        <FileText className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2 ml-auto">
                      {job?.url && (
                        <a href={job.url} target="_blank" rel="noopener noreferrer"
                          className={iconBtnClass}
                          style={iconBtn('var(--surface2)', 'var(--text2)', 'var(--border)')}
                          aria-label="Open vacature">
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                      <button onClick={() => unsaveSaved(app.id)} disabled={busy}
                        className={iconBtnClass}
                        style={iconBtn('rgba(248,113,113,0.08)', 'var(--red)', 'rgba(248,113,113,0.2)')}
                        aria-label="Verwijder">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Action row — applied tab ── */}
                {isApplied && (
                  <div className="relative z-10 flex items-center gap-2 pt-1" style={{ borderTop: '1px solid var(--divider)' }}>
                    <StatusPicker
                      current={app.status as AppStatus}
                      onChange={(s) => updateStatus(app.id, s)}
                    />
                    <div className="flex items-center gap-2 ml-auto">
                      <button onClick={() => setApplyTarget(app)} disabled={busy}
                        className={iconBtnClass}
                        style={iconBtn('rgba(99,102,241,0.08)', '#6366f1', 'rgba(99,102,241,0.15)')}
                        aria-label="Motivatiebrief">
                        <FileText className="w-4 h-4" />
                      </button>
                      <RematchButton
                        applicationId={app.id}
                        onRematched={(data) => handleRematched(app.id, data)}
                      />
                      <button onClick={() => setNoteTarget(app)} disabled={busy}
                        className={iconBtnClass}
                        style={iconBtn('var(--surface2)', 'var(--text2)', 'var(--border)')}
                        aria-label="Notitie">
                        <PencilLine className="w-4 h-4" />
                      </button>
                      {job?.url && (
                        <a href={job.url} target="_blank" rel="noopener noreferrer"
                          className={iconBtnClass}
                          style={iconBtn('var(--surface2)', 'var(--text2)', 'var(--border)')}
                          aria-label="Open vacature">
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                      <button onClick={() => removeApplied(app.id)} disabled={busy}
                        className={iconBtnClass}
                        style={iconBtn('rgba(248,113,113,0.08)', 'var(--red)', 'rgba(248,113,113,0.2)')}
                        aria-label="Verwijder">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

              </motion.div>
            );
          })}
        </AnimatePresence>
      )}

      {/* ApplyModal — used for all three tabs */}
      {applyTarget && (
        <ApplyModal
          application={applyTarget}
          onClose={() => setApplyTarget(null)}
          onApplied={() => { setApplyTarget(null); load(activeTab); }}
          onConfirmed={(id) => {
            setApps(prev => prev.map(a => a.id === id ? { ...a, status: 'applied' } : a));
            setApplyTarget(null);
          }}
        />
      )}

      {/* NoteSheet — key=noteTarget.id forces full remount when switching between items */}
      {noteTarget && (
        <NoteSheet
          key={noteTarget.id}
          app={noteTarget}
          onClose={() => setNoteTarget(null)}
          onSaved={(id, note) => {
            setApps(prev => prev.map(a => a.id === id ? { ...a, note } : a));
            setNoteTarget(null);
          }}
        />
      )}

      {showManual && (
        <ManualApplyModal
          onClose={() => setShowManual(false)}
          onAdded={() => { setShowManual(false); load('queue'); }}
        />
      )}

      {lottieReady && (
        <div className="fixed bottom-6 right-6 pointer-events-none opacity-0 w-0 h-0 overflow-hidden" aria-hidden>
          <Lottie animationData={sparklesJson} loop={false} autoplay={false} />
        </div>
      )}

      <ToastContainer toasts={toasts} dismiss={dismissToast} />
    </main>
  );
}
