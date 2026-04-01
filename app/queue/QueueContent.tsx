'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ExternalLink, XCircle, RefreshCw, Building2, PlusCircle,
  Trash2, MapPin, Bookmark, FileText, X, Sparkles, Loader2, Send,
} from 'lucide-react';
import ScoreBadge from '@/components/ScoreBadge';
import SkeletonCards from '@/components/SkeletonCards';
import ApplyModal from '@/components/ApplyModal';
import ManualApplyModal from '@/components/ManualApplyModal';
import RematchButton from '@/components/RematchButton';
import aiJobScreeningData from '@/app/lotties/Ai Job Screening.json';

// Dynamic import prevents SSR crash — lottie-react uses browser APIs
const Lottie = dynamic(() => import('lottie-react'), { ssr: false });

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
  jobs: Job | null;
}

type Tab = 'queue' | 'saved' | 'applied';
type ScoreFilter = 'all' | 'high' | 'mid' | 'low';

const SCORE_FILTERS: { key: ScoreFilter; label: string }[] = [
  { key: 'all',  label: 'Alles' },
  { key: 'high', label: '\u226575%' },
  { key: 'mid',  label: '50\u201374%' },
  { key: 'low',  label: '<50%' },
];

const TAB_CONFIG: {
  key: Tab;
  label: string;
  accent: string;
  accentBg: string;
  accentBorder: string;
}[] = [
  { key: 'queue',   label: 'Wachtrij',       accent: '#6366f1', accentBg: 'rgba(99,102,241,0.15)',  accentBorder: 'rgba(99,102,241,0.3)' },
  { key: 'saved',   label: 'Bewaard',         accent: '#f59e0b', accentBg: 'rgba(245,158,11,0.15)', accentBorder: 'rgba(245,158,11,0.3)' },
  { key: 'applied', label: 'Gesolliciteerd',  accent: '#22c55e', accentBg: 'rgba(34,197,94,0.15)',  accentBorder: 'rgba(34,197,94,0.3)' },
];

function matchesScore(score: number | null, filter: ScoreFilter) {
  if (filter === 'all' || score === null) return true;
  if (filter === 'high') return score >= 75;
  if (filter === 'mid')  return score >= 50 && score < 75;
  return score < 50;
}

const BULK_SKIP_THRESHOLD = 40;

// ---------------------------------------------------------------------------
// LetterSheet — bottom-sheet for viewing / editing / regenerating a cover
// letter on an already-applied application.
// ---------------------------------------------------------------------------
interface LetterSheetProps {
  app: Application;
  onClose: () => void;
  onSaved: (id: string, letter: string) => void;
}

function LetterSheet({ app, onClose, onSaved }: LetterSheetProps) {
  const [letter, setLetter]         = useState(app.cover_letter_draft ?? '');
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError]     = useState<string | null>(null);

  // fix #4: if the letter is empty (never generated), call POST /api/apply for
  // a fresh full-pipeline generation. If a letter already exists, call
  // POST /api/rematch which re-evaluates without requiring status === 'saved'.
  const regenerate = async () => {
    setGenerating(true); setGenError(null);
    try {
      const isEmpty = letter.trim() === '';
      const endpoint = isEmpty ? '/api/apply' : '/api/rematch';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: app.id }),
      });
      const data = await res.json();
      if (!res.ok) { setGenError(data.error ?? `Fout ${res.status}`); return; }
      if (data.cover_letter_draft) setLetter(data.cover_letter_draft);
      else setGenError('Geen brief teruggekregen \u2014 controleer je Groq API-sleutel in Instellingen.');
    } catch (e: unknown) {
      setGenError((e as Error).message ?? 'Generatie mislukt');
    } finally {
      setGenerating(false);
    }
  };

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/apply', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: app.id, cover_letter_draft: letter }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      onSaved(app.id, letter);
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        key="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end justify-center"
        style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      >
        <motion.div
          key="sheet"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          className="w-full max-w-lg rounded-t-3xl flex flex-col gap-4 p-5 pb-8"
          style={{ background: 'var(--surface)', maxHeight: '90dvh', overflowY: 'auto' }}
          onClick={e => e.stopPropagation()}
        >
          <div className="mx-auto w-10 h-1 rounded-full" style={{ background: 'var(--border)' }} />

          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="font-bold text-base leading-snug" style={{ color: 'var(--text)' }}>
                {app.jobs?.title ?? 'Onbekende functie'}
              </span>
              <span className="text-sm" style={{ color: 'var(--text2)' }}>{app.jobs?.company ?? '\u2014'}</span>
            </div>
            <button
              onClick={onClose}
              className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: 'var(--surface2)' }}
              aria-label="Sluiten"
            >
              <X className="w-4 h-4" style={{ color: 'var(--text2)' }} />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm font-medium" style={{ color: 'var(--text2)' }}>Motivatiebrief</label>
            <button
              onClick={regenerate}
              disabled={generating || saving}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl disabled:opacity-40 active:scale-95"
              style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--accent, #6366f1)', border: '1px solid rgba(99,102,241,0.25)' }}
            >
              {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {generating ? 'Genereren\u2026' : letter.trim() === '' ? 'Genereer brief' : 'Opnieuw genereren'}
            </button>
          </div>

          {genError && (
            <div className="text-xs rounded-xl px-3 py-2"
              style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--red)', border: '1px solid rgba(248,113,113,0.25)' }}>
              {genError}
            </div>
          )}

          {/* fix #2 + #4: whiteSpace pre-wrap ensures \n\n paragraph breaks render
              as visible blank lines instead of collapsing to a wall of text. */}
          <textarea
            value={letter}
            onChange={e => setLetter(e.target.value)}
            rows={10}
            placeholder="Nog geen motivatiebrief \u2014 druk op \u2018Genereer brief\u2019 om er \u00e9\u00e9n te maken."
            className="w-full rounded-2xl p-3.5 text-sm resize-none leading-relaxed focus:outline-none"
            style={{
              background: 'var(--surface2)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              whiteSpace: 'pre-wrap',
            }}
          />

          {error && (
            <div className="text-xs rounded-xl px-3 py-2"
              style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--red)', border: '1px solid rgba(248,113,113,0.25)' }}>
              {error}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button onClick={onClose} disabled={saving || generating}
              className="flex-1 py-3 rounded-2xl text-sm font-semibold disabled:opacity-40"
              style={{ background: 'var(--surface2)', color: 'var(--text2)' }}>Annuleer</button>
            <button onClick={save} disabled={saving || generating}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold disabled:opacity-40 active:scale-95"
              style={{ background: 'var(--accent, #22c55e)', color: '#fff' }}>
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
// Main component
// ---------------------------------------------------------------------------
export default function QueueContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const tabParam = (searchParams.get('tab') as Tab | null) ?? 'queue';
  const [activeTab, setActiveTab] = useState<Tab>(tabParam);

  const [apps, setApps]                 = useState<Application[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [acting, setActing]             = useState<Record<string, boolean>>({});
  const [scoreFilter, setScoreFilter]   = useState<ScoreFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [applyTarget, setApplyTarget]   = useState<Application | null>(null);
  const [letterTarget, setLetterTarget] = useState<Application | null>(null);
  const [showManual, setShowManual]     = useState(false);
  const [bulkSkipping, setBulkSkipping] = useState(false);
  const [counts, setCounts]             = useState<Record<Tab, number>>({ queue: 0, saved: 0, applied: 0 });
  const [lottieReady, setLottieReady]   = useState(false);

  useEffect(() => { setLottieReady(true); }, []);

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    setScoreFilter('all');
    setSourceFilter('all');
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
      setApps(data.applications ?? data.items ?? []);

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
      // silently keep card
    } finally {
      setActing(prev => ({ ...prev, [id]: false }));
    }
  };

  const saveOnly    = async (id: string) => { await act(id, 'saved'); };
  const saveAndApply = async (app: Application) => { await act(app.id, 'saved'); setApplyTarget(app); };

  const bulkSkipLow = async () => {
    if (bulkSkipping) return;
    setBulkSkipping(true);
    const low = apps.filter(a => a.match_score !== null && a.match_score < BULK_SKIP_THRESHOLD);
    await Promise.all(low.map(a => act(a.id, 'skipped')));
    setBulkSkipping(false);
  };

  const emptyTitle =
    apps.length > 0
      ? 'Geen resultaten voor dit filter'
      : activeTab === 'queue'
        ? 'Wachtrij is leeg'
        : activeTab === 'saved'
          ? 'Nog niets bewaard'
          : 'Nog niet gesolliciteerd';

  const emptySub =
    apps.length > 0
      ? 'Pas de filters aan of wacht op nieuwe vacatures.'
      : activeTab === 'queue'
        ? 'Druk op Zoeken op het hoofdscherm om nieuwe vacatures te laden.'
        : activeTab === 'saved'
          ? 'Sla vacatures op vanuit de wachtrij om ze hier te zien.'
          : 'Gesolliciteerde vacatures verschijnen hier automatisch.';

  return (
    <main className="page-shell flex flex-col gap-5">

      {/* Tab bar */}
      <div
        className="flex items-center rounded-2xl p-1 gap-1 relative"
        style={{ background: 'var(--surface2)' }}
        role="tablist"
        aria-label="Navigatie"
      >
        {TAB_CONFIG.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => switchTab(tab.key)}
              className="relative flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold z-10"
              style={{ color: isActive ? tab.accent : 'var(--text2)' }}
            >
              {isActive && (
                <motion.span
                  layoutId="tab-pill"
                  className="absolute inset-0 rounded-xl"
                  style={{ background: tab.accentBg, border: `1px solid ${tab.accentBorder}` }}
                  transition={{ type: 'spring', damping: 26, stiffness: 380 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
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

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>
            {activeConfig.label}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text2)' }}>
            {loading ? 'Laden\u2026' : `${filtered.length} van ${apps.length} vacature${apps.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'queue' && (
            <button
              onClick={() => setShowManual(true)}
              className="flex items-center justify-center w-9 h-9 rounded-xl"
              style={{ background: 'var(--surface2)', color: 'var(--accent)' }}
              aria-label="Manueel toevoegen"
            >
              <PlusCircle className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={() => load(activeTab)}
            disabled={loading}
            className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl transition-opacity disabled:opacity-40"
            style={{ background: 'var(--surface2)', color: 'var(--text2)' }}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Vernieuwen
          </button>
        </div>
      </div>

      {/* Score + source filter chips — queue only */}
      {activeTab === 'queue' && !loading && apps.length > 0 && (
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

      {/* Bulk skip */}
      {activeTab === 'queue' && !loading && lowCount > 0 && (
        <motion.button
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={bulkSkipLow}
          disabled={bulkSkipping}
          className="flex items-center gap-2 w-full px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-40"
          style={{ background: 'rgba(248,113,113,0.08)', color: 'var(--red)', border: '1px solid rgba(248,113,113,0.2)' }}
        >
          <Trash2 className="w-4 h-4" />
          {bulkSkipping
            ? 'Bezig met overslaan\u2026'
            : `Sla ${lowCount} vacature${lowCount !== 1 ? 's' : ''} onder ${BULK_SKIP_THRESHOLD}% over`}
        </motion.button>
      )}

      {error && (
        <div className="rounded-xl px-4 py-3 text-sm"
          style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--red)', border: '1px solid rgba(248,113,113,0.25)' }}>
          {error}
        </div>
      )}

      {loading && <SkeletonCards count={3} />}

      {/* Empty state */}
      {!loading && !error && filtered.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center gap-2 py-10 text-center"
        >
          {lottieReady && (
            <Lottie
              animationData={aiJobScreeningData}
              loop
              autoplay
              style={{ width: 180, height: 180 }}
              aria-hidden="true"
            />
          )}
          <p className="font-semibold text-base mt-1" style={{ color: 'var(--text)' }}>
            {emptyTitle}
          </p>
          <p className="text-sm max-w-xs" style={{ color: 'var(--text2)' }}>
            {emptySub}
          </p>
        </motion.div>
      )}

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
                  {job?.location && (
                    <span className="flex items-center gap-1 text-xs mt-0.5" style={{ color: 'var(--text2)' }}>
                      <MapPin className="w-3 h-3 flex-shrink-0" />
                      {job.location}
                    </span>
                  )}
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

              {app.reasoning && (
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text2)' }}>
                  {app.reasoning}
                </p>
              )}

              {/* Queue actions */}
              {activeTab === 'queue' && (
                <div className="flex items-center gap-2 pt-1">
                  <button onClick={() => saveOnly(app.id)} disabled={busy}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-sm font-semibold disabled:opacity-40 active:scale-95 flex-shrink-0"
                    style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}
                    aria-label="Bewaar vacature">
                    <Bookmark className="w-4 h-4" />
                  </button>
                  <button onClick={() => saveAndApply(app)} disabled={busy}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 active:scale-95"
                    style={{ background: 'rgba(74,222,128,0.15)', color: 'var(--green)', border: '1px solid rgba(74,222,128,0.3)' }}>
                    Solliciteer
                  </button>
                  <button onClick={() => act(app.id, 'skipped')} disabled={busy}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-sm font-semibold disabled:opacity-40 active:scale-95 flex-shrink-0"
                    style={{ background: 'rgba(248,113,113,0.12)', color: 'var(--red)', border: '1px solid rgba(248,113,113,0.25)' }}
                    aria-label="Overslaan">
                    <XCircle className="w-4 h-4" />
                  </button>
                  {job?.url && (
                    <a href={job.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0"
                      style={{ background: 'var(--surface2)', color: 'var(--text2)' }} aria-label="Vacature openen">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              )}

              {/* Saved actions */}
              {activeTab === 'saved' && (
                <div className="flex items-center gap-2 pt-1">
                  <button onClick={() => setApplyTarget(app)} disabled={busy}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 active:scale-95"
                    style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>
                    Brief bekijken / solliciteren
                  </button>
                  {job?.url && (
                    <a href={job.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0"
                      style={{ background: 'var(--surface2)', color: 'var(--text2)' }} aria-label="Vacature openen">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              )}

              {/* Applied actions — cover letter + vacancy link */}
              {activeTab === 'applied' && (
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => setLetterTarget(app)}
                    className="flex items-center gap-1.5 flex-1 justify-center py-2 rounded-xl text-sm"
                    style={{
                      background: app.cover_letter_draft
                        ? 'rgba(99,102,241,0.12)'
                        : 'var(--surface2)',
                      color: app.cover_letter_draft
                        ? 'var(--accent, #6366f1)'
                        : 'var(--text2)',
                      border: app.cover_letter_draft
                        ? '1px solid rgba(99,102,241,0.25)'
                        : '1px solid transparent',
                    }}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    {app.cover_letter_draft ? 'Motivatiebrief' : 'Brief aanmaken'}
                  </button>
                  {job?.url && (
                    <a href={job.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0"
                      style={{ background: 'var(--surface2)', color: 'var(--text2)' }} aria-label="Vacature openen">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Apply modal (saved tab) */}
      {applyTarget && (
        <ApplyModal
          applicationId={applyTarget.id}
          jobTitle={applyTarget.jobs?.title ?? 'Onbekende functie'}
          company={applyTarget.jobs?.company ?? ''}
          initialLetter={applyTarget.cover_letter_draft ?? null}
          initialBullets={null}
          onClose={() => setApplyTarget(null)}
          onConfirmed={(id) => {
            setApps(prev => prev.filter(a => a.id !== id));
            setApplyTarget(null);
          }}
        />
      )}

      {/* Letter sheet (applied tab) */}
      {letterTarget && (
        <LetterSheet
          app={letterTarget}
          onClose={() => setLetterTarget(null)}
          onSaved={(id, letter) => {
            setApps(prev => prev.map(a => a.id === id ? { ...a, cover_letter_draft: letter } : a));
            setLetterTarget(null);
          }}
        />
      )}

      {showManual && (
        <ManualApplyModal
          onClose={() => setShowManual(false)}
          onCreated={() => load(activeTab)}
        />
      )}
    </main>
  );
}
