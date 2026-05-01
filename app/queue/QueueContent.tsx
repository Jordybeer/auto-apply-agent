'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ExternalLink, XCircle, RefreshCw, Building2, PlusCircle,
  Trash2, MapPin, Bookmark, FileText, X, Loader2, Send,
  FileDown, PencilLine, Filter, AlertTriangle, Sparkles, UserCircle2,
  Calendar, ArrowUp, ArrowDown, Pin,
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

/** Only allow http(s) URLs as hrefs to prevent javascript:/data: XSS. */
const isSafeExternalUrl = (url: string | null | undefined): url is string =>
  typeof url === 'string' && /^https?:\/\/.+/i.test(url);

type AppStatus = 'applied' | 'in_progress' | 'rejected' | 'accepted';

interface AppNote {
  id: string;
  text: string;
  created_at: string;
}

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
  notes?: AppNote[] | null;
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
  { key: 'queue',   label: 'Wachtrij',      accent: 'var(--accent)', accentBg: 'var(--accent-dim)',          accentBorder: 'var(--accent-glow)' },
  { key: 'saved',   label: 'Bewaard',        accent: 'var(--yellow)', accentBg: 'var(--yellow-dim)',          accentBorder: 'var(--yellow-glow)' },
  { key: 'applied', label: 'Gesolliciteerd', accent: 'var(--green)',  accentBg: 'var(--green-dim)',           accentBorder: 'var(--green-glow)' },
];

const NAV_TABS = TAB_CONFIG;

const STATUS_BORDER: Record<string, string> = {
  applied:     'var(--green)',
  in_progress: 'var(--yellow)',
  rejected:    'var(--red)',
  accepted:    'var(--accent)',
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

function applySortAndPins(list: Application[], sortOrder: 'asc' | 'desc', pinnedApps: Set<string>) {
  const pinned   = list.filter(a => pinnedApps.has(a.id));
  const unpinned = list.filter(a => !pinnedApps.has(a.id));

  const sorted = [...unpinned].sort((a, b) => {
    const statusDiff = (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
    if (statusDiff !== 0) return statusDiff;
    const dateA = a.applied_at ? new Date(a.applied_at).getTime() : 0;
    const dateB = b.applied_at ? new Date(b.applied_at).getTime() : 0;
    return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
  });

  return [...pinned, ...sorted];
}

const BULK_SKIP_THRESHOLD = 40;
const CLEAR_LOW_THRESHOLD = 50;

const labelBtn = (bg: string, color: string, border: string) =>
  ({ background: bg, color, border: `1px solid ${border}` });

const iconBtn = labelBtn;

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
    <div className="fixed bottom-[calc(var(--navbar-h)+8px)] left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 items-center pointer-events-none w-full px-4 max-w-sm">
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
                  background: 'var(--accent-dim)',
                  color: 'var(--accent-bright)',
                  border: '1px solid var(--accent-glow)',
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
  onSaved: (id: string, notes: AppNote[]) => void;
}

function NoteSheet({ app, onClose, onSaved }: NoteSheetProps) {
  const [notes, setNotes]         = useState<AppNote[]>(app.notes ?? []);
  const [mode, setMode]           = useState<'list' | 'add' | 'edit'>('list');
  const [draftText, setDraftText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    setNotes(app.notes ?? []);
    setMode('list');
    setError(null);
  }, [app.id]);

  async function persistNotes(updated: AppNote[]) {
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/applied', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: app.id, notes: updated }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNotes(updated);
      onSaved(app.id, updated);
    } catch {
      setError('Kon notitie niet opslaan. Probeer opnieuw.');
    } finally {
      setSaving(false);
    }
  }

  function handleAdd() {
    const newNote: AppNote = { id: crypto.randomUUID(), text: draftText.trim(), created_at: new Date().toISOString() };
    persistNotes([newNote, ...notes]).then(() => { setDraftText(''); setMode('list'); });
  }

  function handleEdit() {
    const updated = notes.map(n => n.id === editingId ? { ...n, text: draftText.trim() } : n);
    persistNotes(updated).then(() => { setDraftText(''); setEditingId(null); setMode('list'); });
  }

  function handleRemove(id: string) {
    persistNotes(notes.filter(n => n.id !== id));
  }

  const titleMap = { list: 'Notities', add: 'Nieuwe notitie', edit: 'Notitie bewerken' };

  return (
    <AnimatePresence>
      <motion.div
        key="note-overlay"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="modal-overlay"
        style={{ zIndex: 200 }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          key="note-sheet"
          initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ type: 'spring' as const, damping: 28, stiffness: 300 }}
          className="modal-dialog"
          onClick={e => e.stopPropagation()}
        >
          <div className="modal-header">
            <div className="flex items-start justify-between gap-3 w-full">
              <div className="flex flex-col gap-0.5">
                <span className="font-bold text-base leading-snug" style={{ color: 'var(--text)' }}>{titleMap[mode]}</span>
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
          </div>

          <div className="modal-body">
            {mode === 'list' ? (
              <>
                <button
                  onClick={() => { setDraftText(''); setMode('add'); }}
                  className="btn btn-lg btn-primary w-full"
                >
                  + Nieuwe notitie toevoegen
                </button>
                {notes.length === 0 ? (
                  <p className="text-xs text-center py-4" style={{ color: 'var(--text3)' }}>Nog geen notities.</p>
                ) : (
                  notes.map(n => (
                    <div key={n.id} className="flex flex-col gap-2 rounded-xl px-3 py-3"
                      style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                      <p className="text-sm leading-relaxed" style={{ color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{n.text}</p>
                      <div className="flex items-center justify-between gap-2">
                        <time className="text-xs" style={{ color: 'var(--text3)' }}>
                          {new Date(n.created_at).toLocaleString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </time>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => { setDraftText(n.text); setEditingId(n.id); setMode('edit'); }}
                            disabled={saving}
                            className="btn btn-secondary min-h-[36px] px-3 text-xs"
                          >
                            Bewerken
                          </button>
                          <button
                            onClick={() => handleRemove(n.id)}
                            disabled={saving}
                            className="btn min-h-[36px] px-3 text-xs"
                            style={{ background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid var(--red-glow)' }}
                          >
                            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Verwijderen'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
                {error && (
                  <div className="text-xs rounded-xl px-3 py-2"
                    style={{ background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid var(--red-glow)' }}>
                    {error}
                  </div>
                )}
              </>
            ) : (
              <>
                <textarea
                  autoFocus
                  value={draftText}
                  onChange={e => { setDraftText(e.target.value); if (error) setError(null); }}
                  rows={4}
                  maxLength={2000}
                  placeholder="Voeg een notitie toe…"
                  className="field-textarea"
                />
                {error && (
                  <div className="text-xs rounded-xl px-3 py-2"
                    style={{ background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid var(--red-glow)' }}>
                    {error}
                  </div>
                )}
              </>
            )}
          </div>

          {mode !== 'list' && (
            <div className="modal-footer">
              <button onClick={() => { setDraftText(''); setEditingId(null); setMode('list'); }} disabled={saving}
                className="btn btn-lg btn-secondary">Annuleer</button>
              <button
                onClick={mode === 'add' ? handleAdd : handleEdit}
                disabled={saving || draftText.trim().length === 0}
                className="btn btn-lg btn-primary">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Opslaan
              </button>
            </div>
          )}
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
  const [refreshProgress, setRefreshProgress] = useState(0);
  const [exporting, setExporting]         = useState(false);
  const [sortOrder, setSortOrder]         = useState<'asc' | 'desc'>('desc');
  const [pinnedApps, setPinnedApps]       = useState<Set<string>>(new Set());
  const pinnedSaveTimer                   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [counts, setCounts]               = useState<Record<Tab, number>>({ queue: 0, saved: 0, applied: 0 });
  const [showCheck, setShowCheck]         = useState(false);
  const [lottieReady, setLottieReady]         = useState(false);
  const { toasts, show: showToast, dismiss: dismissToast } = useToast();

  useEffect(() => { setLottieReady(true); }, []);

  useEffect(() => {
    setScoreFilter('all');
    setSourceFilter('all');
    setSortOrder('desc');
  }, [activeTab]);

  const switchTab = (tab: string) => {
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

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.ok ? r.json() : null)
      .then(s => {
        if (Array.isArray(s?.pinned_applications) && s.pinned_applications.length > 0)
          setPinnedApps(new Set(s.pinned_applications as string[]));
      })
      .catch(() => {});
  }, []);

  const savePins = useCallback((next: Set<string>) => {
    if (pinnedSaveTimer.current) clearTimeout(pinnedSaveTimer.current);
    pinnedSaveTimer.current = setTimeout(() => {
      fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned_applications: Array.from(next) }),
      }).catch(() => {});
    }, 600);
  }, []);

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
    setRefreshProgress(0);
    const total = apps.length;
    let completed = 0;
    try {
      await Promise.allSettled(apps.map(a =>
        fetch('/api/rematch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ application_id: a.id }),
        }).finally(() => {
          completed++;
          setRefreshProgress(Math.round((completed / total) * 100));
        })
      ));
      await load(activeTab);
    } catch {}
    finally {
      setRefreshingAll(false);
      setRefreshProgress(0);
    }
  };

  const exportPDF = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const settingsRes = await fetch('/api/settings');
      const settings = settingsRes.ok ? await settingsRes.json() : {};

      let lastExport: Date | null = null;
      if (settings.last_pdf_export) {
        lastExport = new Date(settings.last_pdf_export);
      } else {
        lastExport = new Date();
        lastExport.setDate(lastExport.getDate() - 7);
      }

      const recentApps = apps.filter(a =>
        (a.applied_at && new Date(a.applied_at) > lastExport!) ||
        (a.notes?.some(n => new Date(n.created_at) > lastExport!))
      );

      const statusLabel: Record<string, string> = {
        in_progress: 'In behandeling',
        applied: 'Verstuurd',
        rejected: 'Afgewezen',
      };

      const fmtDate = (d: string | null | undefined) =>
        d ? new Date(d).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

      const recentRows = recentApps.map(a => {
        const newNotes = (a.notes ?? [])
          .filter(n => new Date(n.created_at) > lastExport!)
          .sort((x, y) => x.created_at.localeCompare(y.created_at));
        const notesHtml = newNotes.length > 0
          ? `<div class="notes">${newNotes.map(n => `<div>[${fmtDate(n.created_at)}] ${n.text}</div>`).join('')}</div>`
          : '';
        return `<tr class="recent-row">
          <td>${a.jobs?.title ?? '—'}${notesHtml}</td>
          <td>${a.jobs?.company ?? '—'}</td>
          <td>${fmtDate(a.applied_at)}</td>
          <td>${statusLabel[a.status] ?? a.status}</td>
          <td>${a.match_score != null ? `${a.match_score}%` : '—'}</td>
        </tr>`;
      }).join('');

      const allRows = apps.map(a => `<tr>
        <td>${a.jobs?.title ?? '—'}</td>
        <td>${a.jobs?.company ?? '—'}</td>
        <td>${fmtDate(a.applied_at)}</td>
        <td>${statusLabel[a.status] ?? a.status}</td>
        <td>${a.match_score != null ? `${a.match_score}%` : '—'}</td>
      </tr>`).join('');

      const exportDate = new Date().toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' });
      const exportTime = new Date().toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>Sollicitaties export</title>
      <style>
        body{font-family:system-ui,sans-serif;padding:32px;color:#111;font-size:13px}
        h1{font-size:22px;margin-bottom:4px}
        h2{font-size:16px;margin:28px 0 4px;color:#222}
        p.sub{color:#888;font-size:12px;margin-bottom:8px}
        table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px}
        th{background:#f4f4f4;text-align:left;padding:7px 10px;border-bottom:2px solid #ddd;font-weight:600}
        td{padding:6px 10px;border-bottom:1px solid #eee;vertical-align:top}
        tr.recent-row td{background:#f0fdf4}
        .notes{margin-top:4px;font-size:11px;color:#555;white-space:pre-line}
        @media print{body{padding:16px}}
      </style></head><body>
      <h1>📄 Sollicitaties export</h1>
      <p class="sub">Export: ${exportDate} om ${exportTime} — ${apps.length} sollicitatie${apps.length !== 1 ? 's' : ''}</p>
      ${recentApps.length > 0 ? `
      <h2>🗂️ Recente sollicitaties (sinds vorige export)</h2>
      <table>
        <thead><tr><th>Functie</th><th>Bedrijf</th><th>Datum</th><th>Status</th><th>Score</th></tr></thead>
        <tbody>${recentRows}</tbody>
      </table>` : ''}
      <h2>📊 Alle sollicitaties</h2>
      <table>
        <thead><tr><th>Functie</th><th>Bedrijf</th><th>Datum</th><th>Status</th><th>Score</th></tr></thead>
        <tbody>${allRows}</tbody>
      </table>
      <script>window.onload=()=>{window.print();}<\/script>
      </body></html>`;

      const win = window.open('', '_blank');
      if (!win) throw new Error('Pop-up geblokkeerd — sta pop-ups toe voor deze site');
      win.document.write(html);
      win.document.close();

      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ last_pdf_export: new Date().toISOString() }),
      }).catch(() => {});

      showToast(`✅ Export geopend${recentApps.length > 0 ? ` – ${recentApps.length} recente sollicitatie(s)` : ''}`);
    } catch (e) {
      showToast(`❌ Export mislukt: ${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  };

  const sources = useMemo(() => {
    const s = new Set(apps.map(a => a.jobs?.source).filter(Boolean) as string[]);
    return ['all', ...Array.from(s)];
  }, [apps]);

  const filtered = useMemo(() => apps.filter(a =>
    matchesScore(a.match_score, scoreFilter) &&
    (sourceFilter === 'all' || a.jobs?.source === sourceFilter)
  ), [apps, scoreFilter, sourceFilter]);

  const displayedApps = useMemo(() =>
    activeTab === 'applied' ? applySortAndPins(filtered, sortOrder, pinnedApps) : filtered,
    [filtered, activeTab, sortOrder, pinnedApps]
  );

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

  const iconBtnClass = 'flex-shrink-0 flex items-center justify-center w-11 h-11 rounded-xl disabled:opacity-40 active:scale-95 transition-transform';
  const labelBtnClass = 'flex-shrink-0 flex items-center gap-1.5 px-3 min-h-[44px] rounded-xl text-xs font-semibold disabled:opacity-40 active:scale-95 transition-transform whitespace-nowrap';

  const analyseBtn = labelBtn('var(--yellow-dim)', 'var(--yellow)', 'var(--yellow-glow)');

  return (
    <main className="page-shell flex flex-col gap-5">

      {/* Tab switcher */}
      <div
        className="flex items-center rounded-2xl p-1 gap-1 relative"
        style={{ background: 'var(--surface2)', zIndex: 1 }}
        role="tablist" aria-label="Navigatie"
        data-walkthrough="wachtrij"
      >
        {NAV_TABS.map(tab => {
          const isActive = activeTab === tab.key;
          const count = counts[tab.key];
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => switchTab(tab.key)}
              className="relative flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold"
              style={{ color: isActive ? tab.accent : 'var(--text2)', isolation: 'isolate', border: '1px solid var(--nav-pill-border)' }}
            >
              {isActive && (
                <motion.span
                  layoutId="queue-tab-pill"
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
                {count > 0 && (
                  <motion.span
                    key={`${tab.key}-${count}`}
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold px-1"
                    style={{
                      background: isActive ? tab.accent : 'var(--border)',
                      color: isActive ? '#fff' : 'var(--text2)',
                    }}
                  >
                    {count}
                  </motion.span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold truncate" style={{ color: 'var(--text)' }}>
            {activeConfig.label}
          </h1>
          <p className="text-sm mt-0.5 truncate" style={{ color: 'var(--text2)' }}>
            {loading ? 'Laden…' : `${filtered.length} van ${apps.length} vacature${apps.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {activeTab === 'queue' && (
            <button onClick={() => setShowManual(true)}
              className="flex items-center justify-center w-11 h-11 rounded-xl active:scale-95 transition-transform"
              style={{ background: 'var(--surface2)', color: 'var(--accent)' }}
              aria-label="Manueel toevoegen">
              <PlusCircle className="w-5 h-5" />
            </button>
          )}
          {activeTab === 'applied' && !loading && apps.length > 0 && (
            <button onClick={exportPDF} disabled={exporting}
              className="flex items-center gap-1.5 text-sm px-3 min-h-[44px] rounded-xl disabled:opacity-40 active:scale-95 transition-transform"
              style={{ background: 'var(--surface2)', color: 'var(--text2)' }}>
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} Export
            </button>
          )}
          {!loading && apps.length > 0 && (
            <button onClick={refreshAllScores} disabled={refreshingAll}
              className="flex items-center gap-1.5 text-sm px-3 min-h-[44px] rounded-xl disabled:opacity-40 active:scale-95 transition-all duration-300"
              style={{
                background: refreshingAll
                  ? `linear-gradient(to right, rgba(74,222,128,0.35) ${refreshProgress}%, var(--surface2) ${refreshProgress}%)`
                  : 'var(--surface2)',
                color: 'var(--text2)',
                transition: 'background 0.3s ease',
              }}>
              <RefreshCw className={`w-4 h-4 ${refreshingAll ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Herbereken scores</span>
            </button>
          )}
        </div>
      </div>

      {(activeTab === 'queue' || activeTab === 'saved') && !loading && apps.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {SCORE_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setScoreFilter(f.key)}
              aria-pressed={scoreFilter === f.key}
              className="text-xs px-3 py-1.5 rounded-full font-medium transition-colors min-h-[36px]"
              style={{
                background: scoreFilter === f.key ? 'var(--accent)' : 'var(--surface2)',
                color: scoreFilter === f.key ? '#fff' : 'var(--text2)',
              }}>
              {f.label}
            </button>
          ))}
          {sources.length > 2 && sources.map(s => (
            <button key={s} onClick={() => setSourceFilter(s)} aria-pressed={sourceFilter === s}
              className="text-xs px-3 py-1.5 rounded-full font-medium transition-colors capitalize min-h-[36px]"
              style={{
                background: sourceFilter === s ? 'var(--accent)' : 'var(--surface2)',
                color: sourceFilter === s ? '#fff' : 'var(--text2)',
              }}>
              {s === 'all' ? 'Alle bronnen' : s}
            </button>
          ))}

          {activeTab === 'queue' && lowCount >= 3 && (
            <button onClick={bulkSkipLow} disabled={bulkSkipping}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium ml-auto min-h-[36px] disabled:opacity-40"
              style={{ background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid var(--red-glow)' }}>
              {bulkSkipping ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
              Skip &lt;{BULK_SKIP_THRESHOLD}% ({lowCount})
            </button>
          )}

          {clearLowCount > 0 && (
            <button
              onClick={confirmClearLow}
              disabled={clearingLow}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium min-h-[36px] disabled:opacity-40"
              style={{
                background: 'var(--red-dim)',
                color: 'var(--red)',
                border: '1px solid var(--red-glow)',
                marginLeft: activeTab === 'saved' ? 'auto' : undefined,
              }}
            >
              {clearingLow
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <Filter className="w-3 h-3" />
              }
              Wis laag ({clearLowCount})
            </button>
          )}
        </div>
      )}

      {activeTab === 'applied' && !loading && apps.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium transition-colors min-h-[36px]"
            style={{ background: 'var(--surface2)', color: 'var(--text2)' }}
            title={sortOrder === 'asc' ? 'Oplopend' : 'Aflopend'}>
            <Calendar className="w-3.5 h-3.5" />
            {sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />}
            Datum
          </button>
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
              background: 'var(--red-dim)',
              border: '1px solid var(--red-glow)',
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
              style={{ background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid var(--red-glow)' }}
            >
              {clearingLow ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Wis alles'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {loading && <SkeletonCards count={4} />}

      {!loading && error && (
        <div className="text-sm rounded-2xl px-4 py-3"
          style={{ background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid var(--red-glow)' }}>
          {error}
        </div>
      )}

      {!loading && !error && displayedApps.length === 0 && filtered.length === 0 && (
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
          <div className="flex flex-col items-center gap-3">
            <div>
              <p className="font-semibold text-base" style={{ color: 'var(--text)' }}>{emptyTitle}</p>
              <p className="text-sm mt-1 max-w-xs mx-auto" style={{ color: 'var(--text2)' }}>{emptySub}</p>
            </div>
            {apps.length === 0 && activeTab === 'queue' && (
              <button
                onClick={() => router.push('/')}
                className="flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-semibold"
                style={{
                  background: 'var(--accent-dim)',
                  color: 'var(--accent-bright)',
                  border: '1px solid var(--accent-glow)',
                }}
              >
                <Sparkles className="w-4 h-4" />
                Ga naar zoeken
              </button>
            )}
          </div>
        </div>
      )}

      {!loading && !error && displayedApps.length > 0 && (
        <AnimatePresence mode="popLayout">
          {displayedApps.map((app, i) => {
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
                      <span className="font-semibold text-sm leading-snug line-clamp-2" style={{ color: 'var(--text)' }}>
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
                      {isApplied && app.applied_at && (
                        <span className="text-xs" style={{ color: 'var(--text3)' }}>
                          {new Date(app.applied_at).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' })}
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

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isApplied && (
                      <button
                        onClick={() => {
                          const newPinned = new Set(pinnedApps);
                          if (newPinned.has(app.id)) newPinned.delete(app.id);
                          else newPinned.add(app.id);
                          setPinnedApps(newPinned);
                          savePins(newPinned);
                        }}
                        className="flex items-center justify-center w-10 h-10 rounded-lg transition-all active:scale-95"
                        style={{
                          background: pinnedApps.has(app.id) ? 'var(--yellow-dim)' : 'var(--surface2)',
                          color: pinnedApps.has(app.id) ? 'var(--yellow)' : 'var(--text2)',
                          border: `1px solid ${pinnedApps.has(app.id) ? 'var(--yellow-glow)' : 'var(--border)'}`,
                        }}
                        aria-label={pinnedApps.has(app.id) ? 'Losmaken' : 'Vastmaken'}
                        title={pinnedApps.has(app.id) ? 'Losmaken' : 'Vastmaken'}
                      >
                        <Pin className="w-4 h-4" style={{ transform: pinnedApps.has(app.id) ? 'rotate(-45deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                      </button>
                    )}
                    {(isQueue || isSaved) && (
                      <RematchButton
                        applicationId={app.id}
                        onRematched={(data) => handleRematched(app.id, data)}
                      />
                    )}
                  </div>
                </div>

                {app.reasoning && (
                  <div className="relative z-10 rounded-xl px-3 py-2"
                    style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text2)' }}>
                      {app.reasoning}
                    </p>
                  </div>
                )}

                {(app.contact_person || app.contact_email) && (
                  <div className="relative z-10 flex items-center gap-3 flex-wrap">
                    {app.contact_person && (
                      <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text2)' }}>
                        <UserCircle2 className="w-3.5 h-3.5 shrink-0" />
                        {app.contact_person}
                      </span>
                    )}
                    {app.contact_email && (
                      <a href={`mailto:${app.contact_email}`} className="text-xs underline" style={{ color: 'var(--accent)' }}>
                        {app.contact_email}
                      </a>
                    )}
                  </div>
                )}

                {(app.notes?.length ?? 0) > 0 && (
                  <div className="relative z-10 flex flex-col gap-1.5">
                    {[...app.notes!].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()).map(n => (
                      <div key={n.id} className="text-xs rounded-xl px-3 py-2 leading-relaxed"
                        style={{ background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }}>
                        <p className="text-xs mb-1" style={{ color: 'var(--text3)' }}>
                          {new Date(n.created_at).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                        <p style={{ whiteSpace: 'pre-wrap' }}>{n.text}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── Action row — queue tab ── */}
                {isQueue && (
                  <div className="relative z-10 flex flex-wrap items-center gap-2 pt-2" style={{ borderTop: '1px solid var(--divider)' }}>
                    <button onClick={() => act(app.id, 'skipped')} disabled={busy}
                      className={labelBtnClass}
                      style={labelBtn('var(--surface2)', 'var(--text3)', 'var(--border)')}>
                      <XCircle className="w-3.5 h-3.5" />
                      Overslaan
                    </button>
                    {isSafeExternalUrl(job?.url) && (
                      <a href={`/analyse?url=${encodeURIComponent(job.url)}`}
                        className={labelBtnClass}
                        style={analyseBtn}>
                        <Sparkles className="w-3.5 h-3.5" />
                        Analyse
                      </a>
                    )}
                    <button onClick={() => saveOnly(app.id)} disabled={busy}
                      className={labelBtnClass}
                      style={labelBtn('var(--yellow-dim)', 'var(--yellow)', 'var(--yellow-glow)')}>
                      <Bookmark className="w-3.5 h-3.5" />
                      Bewaar
                    </button>
                    <button onClick={() => saveAndApply(app)} disabled={busy}
                      className={labelBtnClass}
                      style={labelBtn('var(--accent-dim)', 'var(--accent)', 'var(--accent-glow)')}>
                      <Send className="w-3.5 h-3.5" />
                      Solliciteer
                    </button>
                    {isSafeExternalUrl(job?.url) && (
                      <a href={job.url} target="_blank" rel="noopener noreferrer"
                        className={iconBtnClass}
                        style={iconBtn('var(--surface2)', 'var(--text2)', 'var(--border)')}
                        aria-label="Open vacature">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                )}

                {/* ── Action row — saved tab ── */}
                {isSaved && (
                  <div className="relative z-10 flex flex-wrap items-center gap-2 pt-2" style={{ borderTop: '1px solid var(--divider)' }}>
                    <button onClick={() => unsaveSaved(app.id)} disabled={busy}
                      className={labelBtnClass}
                      style={labelBtn('var(--red-dim)', 'var(--red)', 'var(--red-glow)')}>
                      <Trash2 className="w-3.5 h-3.5" />
                      Verwijder
                    </button>
                    {isSafeExternalUrl(job?.url) && (
                      <a href={`/analyse?url=${encodeURIComponent(job.url)}`}
                        className={labelBtnClass}
                        style={analyseBtn}>
                        <Sparkles className="w-3.5 h-3.5" />
                        Analyse
                      </a>
                    )}
                    <button onClick={() => setApplyTarget(app)} disabled={busy}
                      className={labelBtnClass}
                      style={labelBtn('var(--accent-dim)', 'var(--accent)', 'var(--accent-glow)')}>
                      <Send className="w-3.5 h-3.5" />
                      Solliciteer
                    </button>
                    {isSafeExternalUrl(job?.url) && (
                      <a href={job.url} target="_blank" rel="noopener noreferrer"
                        className={iconBtnClass}
                        style={iconBtn('var(--surface2)', 'var(--text2)', 'var(--border)')}
                        aria-label="Open vacature">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                )}

                {/* ── Action row — applied tab ── */}
                {isApplied && (
                  <div className="relative z-10 flex flex-wrap items-center gap-2 pt-2" style={{ borderTop: '1px solid var(--divider)' }}>
                    <StatusPicker
                      current={app.status as AppStatus}
                      onChange={(s) => updateStatus(app.id, s)}
                    />
                    {isSafeExternalUrl(job?.url) && (
                      <a href={`/analyse?url=${encodeURIComponent(job.url)}`}
                        className={iconBtnClass}
                        style={iconBtn('var(--yellow-dim)', 'var(--yellow)', 'var(--yellow-glow)')}
                        aria-label="Analyse">
                        <Sparkles className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <button onClick={() => setApplyTarget(app)} disabled={busy}
                      className={iconBtnClass}
                      style={iconBtn('var(--accent-dim)', 'var(--accent)', 'var(--accent-glow)')}
                      aria-label="Brief bekijken">
                      <FileText className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setNoteTarget(app)} disabled={busy}
                      className={iconBtnClass}
                      style={iconBtn('var(--surface2)', 'var(--text2)', 'var(--border)')}
                      aria-label="Notitie">
                      <PencilLine className="w-3.5 h-3.5" />
                    </button>
                    <RematchButton
                      applicationId={app.id}
                      onRematched={(data) => handleRematched(app.id, data)}
                    />
                    {isSafeExternalUrl(job?.url) && (
                      <a href={job.url} target="_blank" rel="noopener noreferrer"
                        className={iconBtnClass}
                        style={iconBtn('var(--surface2)', 'var(--text2)', 'var(--border)')}
                        aria-label="Open vacature">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                    <button onClick={() => removeApplied(app.id)} disabled={busy}
                      className={iconBtnClass}
                      style={iconBtn('var(--red-dim)', 'var(--red)', 'var(--red-glow)')}
                      aria-label="Verwijder">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}

              </motion.div>
            );
          })}
        </AnimatePresence>
      )}

      {applyTarget && (
        <ApplyModal
          application={applyTarget}
          onClose={() => setApplyTarget(null)}
          onApplied={() => { setApplyTarget(null); load(activeTab); }}
          onConfirmed={(id) => {
            setApps(prev => prev.map(a => a.id === id ? { ...a, status: 'applied' } : a));
            setApplyTarget(null);
            setShowCheck(true);
            setTimeout(() => setShowCheck(false), 1800);
          }}
        />
      )}

      {noteTarget && (
        <NoteSheet
          key={noteTarget.id}
          app={noteTarget}
          onClose={() => setNoteTarget(null)}
          onSaved={(id, notes) => {
            setApps(prev => prev.map(a => a.id === id ? { ...a, notes } : a));
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

      <AnimatePresence>
        {showCheck && (
          <motion.div
            className="fixed inset-0 flex items-center justify-center pointer-events-none"
            style={{ zIndex: 500 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              className="flex items-center justify-center rounded-full"
              style={{
                width: 96, height: 96,
                background: 'var(--green)',
                boxShadow: '0 0 48px rgba(74,222,128,0.45)',
              }}
              initial={{ scale: 0, rotate: -15 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0.7, opacity: 0 }}
              transition={{ type: 'spring', damping: 14, stiffness: 280 }}
            >
              <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
                <motion.path
                  d="M9 22 L18 32 L35 14"
                  stroke="white"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ delay: 0.15, duration: 0.35, ease: 'easeOut' }}
                />
              </svg>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ToastContainer toasts={toasts} dismiss={dismissToast} />
    </main>
  );
}
