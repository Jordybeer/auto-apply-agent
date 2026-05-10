'use client';

import { useState, useRef, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Link2,
  Sparkles,
  TrendingDown,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  RotateCcw,
  UserCircle2,
  X,
  ChevronDown,
  Bookmark,
  Trash2,
  Banknote,
  Zap,
  MessageSquare,
  FileText,
  ExternalLink,
} from 'lucide-react';

interface Analysis {
  titel: string;
  bedrijf: string;
  overall_score: number;
  verdict: string;
  pluspunten: string[];
  aandachtspunten: string[];
  advies: string;
  salarisschatting?: string;
  vaardigheidsgap?: string[];
  gespreksopeners?: string[];
}

function scoreColor(score: number): string {
  if (score >= 75) return 'var(--green)';
  if (score >= 50) return 'var(--yellow)';
  return 'var(--red)';
}

function scoreGlow(score: number): string {
  if (score >= 75) return 'var(--green-glow)';
  if (score >= 50) return 'var(--yellow-glow)';
  return 'var(--red-glow)';
}

function VerdictBadge({ score }: { score: number }) {
  const label = score >= 75 ? 'Sterke match' : score >= 50 ? 'Matige match' : 'Zwakke match';
  const color = scoreColor(score);
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase"
      style={{
        border: `1.5px solid ${color}`,
        color,
        background: `${color}18`,
      }}
    >
      {score >= 75 ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
      {label}
    </span>
  );
}

function ProfileBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="flex items-center gap-3 rounded-2xl px-4 py-3 mb-4"
      style={{
        background: 'var(--accent-dim)',
        border: '1px solid var(--accent)',
      }}
    >
      <UserCircle2 size={18} className="shrink-0" style={{ color: 'var(--accent)' }} />
      <p className="flex-1 text-[13px] leading-snug m-0" style={{ color: 'var(--text)' }}>
        <strong>Profiel onvolledig</strong> — Vul je CV en sleutelwoorden in voor nauwkeurigere analyses.{' '}
        <a
          href="/profiel"
          className="font-semibold underline underline-offset-2"
          style={{ color: 'var(--accent)' }}
        >
          Profiel aanvullen →
        </a>
      </p>
      <button
        onClick={onDismiss}
        aria-label="Banner sluiten"
        className="shrink-0 flex items-center justify-center w-7 h-7 rounded-full cursor-pointer"
        style={{ background: 'none', border: 'none', color: 'var(--text2)' }}
      >
        <X size={14} />
      </button>
    </motion.div>
  );
}

/* ─── Shimmer skeleton for the loading state ─────────────────────── */
function LoadingSkeleton() {
  return (
    <motion.div
      key="loading"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-3"
    >
      {/* Hero card skeleton */}
      <div className="glass rounded-2xl px-5 py-6 flex flex-col items-center gap-4">
        {/* Pulsing icon */}
        <motion.div
          animate={{ scale: [1, 1.12, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
          className="w-14 h-14 rounded-full flex items-center justify-center"
          style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent)' }}
        >
          <Sparkles size={24} style={{ color: 'var(--accent)' }} />
        </motion.div>

        <div className="text-center space-y-1">
          <p className="text-[15px] font-semibold m-0" style={{ color: 'var(--text)' }}>
            Vacature ophalen en analyseren&hellip;
          </p>
          <p className="text-[12px] m-0" style={{ color: 'var(--text2)' }}>Dit duurt enkele seconden</p>
        </div>

        {/* Skeleton lines */}
        <div className="w-full space-y-2 pt-1">
          <div className="skeleton h-3 w-3/5 mx-auto rounded-full" />
          <div className="skeleton h-2.5 w-4/5 mx-auto rounded-full" />
          <div className="skeleton h-2.5 w-2/3 mx-auto rounded-full" />
        </div>
      </div>

      {/* Score bar skeletons */}
      <div className="glass rounded-2xl px-5 py-5 space-y-4">
        {[80, 60, 45, 70, 55].map((w, i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex justify-between">
              <div className="skeleton h-3 rounded-full" style={{ width: `${w - 20}%` }} />
              <div className="skeleton h-3 w-10 rounded-full" />
            </div>
            <div className="skeleton h-[7px] rounded-full" style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
    </motion.div>
  );
}

export default function AnalyseClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [url, setUrl] = useState(() => searchParams.get('url') ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ analysis: Analysis; url: string } | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [contextKeywords, setContextKeywords] = useState('');
  const [contextCity, setContextCity] = useState('');
  const [contextCvText, setContextCvText] = useState('');
  const [savedKeywords, setSavedKeywords] = useState('');
  const [savedCity, setSavedCity] = useState('');
  const [savedCvText, setSavedCvText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [bewaarState, setBewaarState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [removeState, setRemoveState] = useState<'idle' | 'removing'>('idle');
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [paywalled, setPaywalled] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const autoSubmitDone = useRef(false);

  useEffect(() => {
    fetch('/api/profiel')
      .then(r => r.json())
      .then(data => {
        const profile = data?.profile ?? data;
        const isIncomplete = !profile?.cv_text?.trim() || !profile?.keywords?.length;
        setShowBanner(isIncomplete);
        const kw = profile?.keywords?.length ? profile.keywords.join(', ') : '';
        const ct = profile?.city ?? '';
        const cv = profile?.cv_text ?? '';
        setContextKeywords(kw);
        setContextCity(ct);
        setContextCvText(cv);
        setSavedKeywords(kw);
        setSavedCity(ct);
        setSavedCvText(cv);
      })
      .catch(() => {});
  }, []);

  // Auto-submit when a URL is passed via query param
  useEffect(() => {
    const prefilledUrl = searchParams.get('url');
    if (prefilledUrl && !autoSubmitDone.current) {
      autoSubmitDone.current = true;
      setLoading(true);
      setError(null);
      setResult(null);
      fetch('/api/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: prefilledUrl }),
      })
        .then(async r => { const d = await r.json(); return { status: r.status, data: d }; })
        .then(({ status, data }) => {
          if (status === 402) { setPaywalled(true); return; }
          if (!data.success) setError(data.error ?? 'Er is iets misgegaan.');
          else setResult({ analysis: data.analysis, url: data.url });
        })
        .catch(() => setError('Netwerkfout. Probeer opnieuw.'))
        .finally(() => setLoading(false));
    }
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setPaywalled(false);

    try {
      const res = await fetch('/api/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          keywords: contextKeywords.trim() || undefined,
          city: contextCity.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.status === 402) { setPaywalled(true); }
      else if (!res.ok || !data.success) { setError(data.error ?? 'Er is iets misgegaan.'); }
      else { setResult({ analysis: data.analysis, url: data.url }); }
    } catch {
      setError('Netwerkfout. Probeer opnieuw.');
    } finally {
      setLoading(false);
    }
  }

  async function saveContext() {
    setSaving(true);
    try {
      const keywords = contextKeywords.trim().split(',').map(k => k.trim()).filter(Boolean);
      await fetch('/api/profiel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords, city: contextCity.trim(), cv_text: contextCvText.trim() }),
      });
      setSavedKeywords(contextKeywords.trim());
      setSavedCity(contextCity.trim());
      setSavedCvText(contextCvText.trim());
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setResult(null);
    setError(null);
    setUrl('');
    setPaywalled(false);
    setBewaarState('idle');
    setRemoveState('idle');
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  function showToast(msg: string, ok: boolean, ms = 2500) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), ms);
  }

  async function removeJob() {
    if (!result || removeState !== 'idle') return;
    setRemoveState('removing');
    try {
      const res = await fetch('/api/analyse/save', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: result.url }),
      });
      if (res.ok) {
        showToast('Vacature verwijderd', true, 2000);
        setTimeout(reset, 600);
      } else {
        showToast('Verwijderen mislukt', false);
        setRemoveState('idle');
      }
    } catch {
      showToast('Verwijderen mislukt', false);
      setRemoveState('idle');
    }
  }

  async function bewaarJob() {
    if (!result || bewaarState !== 'idle') return;
    setBewaarState('saving');
    try {
      const res = await fetch('/api/analyse/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: result.url,
          titel: result.analysis.titel,
          bedrijf: result.analysis.bedrijf,
          overall_score: result.analysis.overall_score,
        }),
      });
      if (res.ok) {
        setBewaarState('saved');
        showToast('Vacature bewaard', true, 2500);
        setTimeout(() => router.push('/queue?tab=saved'), 1200);
      } else {
        setBewaarState('idle');
        showToast('Opslaan mislukt', false);
      }
    } catch {
      setBewaarState('idle');
      showToast('Opslaan mislukt', false);
    }
  }

  const contextChanged =
    contextKeywords.trim() !== savedKeywords ||
    contextCity.trim() !== savedCity ||
    contextCvText.trim() !== savedCvText;

  const overallScore = result?.analysis?.overall_score ?? 0;
  const cvSnippet = savedCvText.trim().slice(0, 120);
  const hasCv = !!savedCvText.trim();

  return (
    <main className="page-shell">
      <div>
        {/* ── Page header ─────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="mb-6"
        >
          <div className="flex items-center gap-2 mb-1.5">
            <Sparkles size={18} style={{ color: 'var(--accent)' }} />
            <h1 className="text-[20px] font-bold m-0" style={{ color: 'var(--text)' }}>
              Vacature analyseren
            </h1>
          </div>
          <p className="text-[13px] m-0" style={{ color: 'var(--text2)' }}>
            Plak een vacaturelink en ontdek hoe goed hij bij jou past.
          </p>
        </motion.div>

        {/* ── Profile banner ──────────────────────────────────────── */}
        <AnimatePresence>
          {showBanner && (
            <ProfileBanner key="profile-banner" onDismiss={() => setShowBanner(false)} />
          )}
        </AnimatePresence>

        {/* ── Input form ──────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {!result && (
            <motion.form
              key="form"
              onSubmit={handleSubmit}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="glass rounded-2xl p-5 mb-5"
            >
              <label className="block text-[13px] font-semibold mb-2" style={{ color: 'var(--text)' }}>
                Vacature URL
              </label>

              <div className="flex gap-2">
                {/* URL input — overflow-hidden prevents typed text from escaping the pill */}
                <div
                  data-walkthrough="analyse-url"
                  className="flex-1 min-w-0 flex items-center gap-2 rounded-xl px-3 overflow-hidden"
                  style={{
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <Link2 size={15} className="shrink-0" style={{ color: 'var(--text2)' }} />
                  <input
                    ref={inputRef}
                    type="url"
                    required
                    placeholder="https://www.jobat.be/nl/jobs/..."
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    className="flex-1 min-w-0 bg-transparent border-none outline-none text-[14px] py-2.5"
                    style={{ color: 'var(--text)' }}
                  />
                </div>

                {/* Submit button */}
                <motion.button
                  type="submit"
                  disabled={loading || !url.trim()}
                  whileTap={{ scale: 0.93 }}
                  animate={!loading && url.trim() ? { boxShadow: ['0 0 0px 0px var(--accent)', '0 0 10px 3px var(--accent-dim)', '0 0 0px 0px var(--accent)'] } : {}}
                  transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                  className="btn btn-primary shrink-0 h-[44px] px-4 rounded-xl text-[14px] min-w-[100px]"
                  style={
                    loading || !url.trim()
                      ? { background: 'var(--surface2)', color: 'var(--text2)', boxShadow: 'none', cursor: 'not-allowed' }
                      : undefined
                  }
                >
                  {loading ? (
                    <>
                      <motion.span
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                        className="inline-block"
                      >
                        &#x27F3;
                      </motion.span>
                      Analyseren
                    </>
                  ) : (
                    <><Sparkles size={14} /> Analyseer</>
                  )}
                </motion.button>
              </div>

              {/* Context toggle */}
              <button
                type="button"
                onClick={() => setShowContext(v => !v)}
                className="flex items-center gap-1.5 mt-3 bg-transparent border-none p-0 cursor-pointer text-[12px] font-semibold"
                style={{ color: 'var(--text2)' }}
              >
                <motion.span
                  animate={{ rotate: showContext ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="inline-flex"
                >
                  <ChevronDown size={13} />
                </motion.span>
                {showContext ? 'Context verbergen' : 'Profielcontext aanpassen'}
              </button>

              {/* Collapsible context fields */}
              <AnimatePresence>
                {showContext && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="flex flex-col gap-2 mt-3">
                      <div>
                        <label className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>
                          Doelfuncties / zoekwoorden
                        </label>
                        <input
                          type="text"
                          value={contextKeywords}
                          onChange={e => setContextKeywords(e.target.value)}
                          placeholder="bv. IT helpdesk, servicedesk, support"
                          className="field-input"
                        />
                      </div>
                      <div>
                        <label className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>
                          Voorkeurslocatie
                        </label>
                        <input
                          type="text"
                          value={contextCity}
                          onChange={e => setContextCity(e.target.value)}
                          placeholder="bv. Antwerpen"
                          className="field-input"
                        />
                      </div>

                      {/* CV snippet / status */}
                      <div
                        className="rounded-xl px-3 py-2.5 flex items-start gap-2"
                        style={{
                          background: hasCv ? 'var(--surface2)' : 'rgba(245,158,11,0.08)',
                          border: hasCv ? '1px solid var(--border)' : '1px solid rgba(245,158,11,0.3)',
                        }}
                      >
                        <FileText size={13} className="shrink-0 mt-[2px]" style={{ color: hasCv ? 'var(--text2)' : 'var(--yellow)' }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-semibold m-0 mb-0.5" style={{ color: hasCv ? 'var(--text2)' : 'var(--yellow)' }}>
                            {hasCv ? 'CV geladen' : 'Geen CV ingesteld'}
                          </p>
                          {hasCv ? (
                            <p className="text-[11px] m-0 truncate" style={{ color: 'var(--text3)' }}>
                              {cvSnippet}{savedCvText.trim().length > 120 ? '…' : ''}
                            </p>
                          ) : (
                            <p className="text-[11px] m-0" style={{ color: 'var(--text2)' }}>
                              Voeg je CV toe voor nauwkeurigere scores.
                            </p>
                          )}
                        </div>
                        <a
                          href="/profiel"
                          className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold no-underline"
                          style={{ color: 'var(--accent)' }}
                        >
                          {hasCv ? 'Bewerken' : 'Toevoegen'} <ExternalLink size={10} />
                        </a>
                      </div>
                    </div>

                    {contextChanged && (
                      <div className="flex justify-end mt-2">
                        <button
                          type="button"
                          onClick={saveContext}
                          disabled={saving}
                          className="btn btn-sm rounded-xl text-[12px] font-semibold"
                          style={
                            saveOk
                              ? { background: 'var(--green-dim)', color: 'var(--green)', border: '1px solid var(--green)' }
                              : { background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }
                          }
                        >
                          {saveOk ? 'Opgeslagen ✓' : saving ? 'Opslaan…' : 'Opslaan in profiel'}
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Error */}
              {error && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-3 text-[13px]"
                  style={{ color: 'var(--red)' }}
                >
                  {error}
                </motion.p>
              )}

              <p className="mt-3 text-[12px] leading-relaxed" style={{ color: 'var(--text2)' }}>
                De analyse gebruikt jouw CV en profielinstellingen.
              </p>
            </motion.form>
          )}
        </AnimatePresence>

        {/* ── Loading skeleton ────────────────────────────────────── */}
        <AnimatePresence>
          {loading && <LoadingSkeleton />}
        </AnimatePresence>

        {/* ── Paywall ─────────────────────────────────────────────── */}
        <AnimatePresence>
          {paywalled && !loading && (
            <motion.div
              key="paywall"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="glass rounded-2xl px-5 py-8 flex flex-col items-center gap-4 text-center"
            >
              <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent)' }}>
                <Sparkles size={24} style={{ color: 'var(--accent)' }} />
              </div>
              <div>
                <p className="text-[17px] font-bold m-0 mb-1" style={{ color: 'var(--text)' }}>Gratis analyse gebruikt</p>
                <p className="text-[13px] m-0 leading-relaxed" style={{ color: 'var(--text2)' }}>
                  Je hebt je gratis analyse opgebruikt. Upgrade naar Premium voor onbeperkte analyses, automatische scoring en meer.
                </p>
              </div>
              <a
                href="/upgrade"
                className="btn btn-primary btn-lg rounded-2xl w-full h-[48px] no-underline flex items-center justify-center gap-2"
              >
                <Sparkles size={15} /> Upgrade naar Premium
              </a>
              <p className="text-[12px] m-0" style={{ color: 'var(--text3)' }}>2 gratis analyses per week — daarna Jobhunt Pack vanaf €14,99</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Result ──────────────────────────────────────────────── */}
        <AnimatePresence>
          {result && !loading && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-3"
            >
              {/* ── Hero score card ──────────────────────────────── */}
              <div className="glass rounded-2xl px-5 py-6 text-center">
                <VerdictBadge score={overallScore} />

                {/* Score ring + number */}
                <div className="relative inline-flex items-center justify-center my-5">
                  {/* SVG progress ring */}
                  <svg
                    width={96}
                    height={96}
                    viewBox="0 0 96 96"
                    className="-rotate-90"
                    aria-hidden="true"
                  >
                    {/* Track */}
                    <circle
                      cx={48} cy={48} r={40}
                      fill="none"
                      strokeWidth={6}
                      style={{ stroke: 'var(--surface2)' }}
                    />
                    {/* Progress */}
                    <motion.circle
                      cx={48} cy={48} r={40}
                      fill="none"
                      strokeWidth={6}
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 40}`}
                      initial={{ strokeDashoffset: 2 * Math.PI * 40 }}
                      animate={{ strokeDashoffset: 2 * Math.PI * 40 * (1 - overallScore / 100) }}
                      transition={{ duration: 1, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
                      style={{ stroke: scoreColor(overallScore) }}
                    />
                  </svg>
                  {/* Score number centred over ring */}
                  <motion.span
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.1, type: 'spring', stiffness: 280, damping: 20 }}
                    className="absolute text-[28px] font-extrabold tabular-nums leading-none"
                    style={{
                      color: scoreColor(overallScore),
                      filter: `drop-shadow(0 0 10px ${scoreGlow(overallScore)})`,
                    }}
                  >
                    {overallScore}
                  </motion.span>
                </div>

                <p className="text-[11px] font-semibold tracking-wider uppercase -mt-2 mb-4" style={{ color: 'var(--text2)' }}>
                  / 100
                </p>

                <h2 className="text-[17px] font-bold m-0 mb-1" style={{ color: 'var(--text)' }}>
                  {result.analysis.titel}
                </h2>
                <p className="text-[13px] m-0 mb-4" style={{ color: 'var(--text2)' }}>
                  {result.analysis.bedrijf}
                </p>

                {/* Verdict callout */}
                <div
                  className="rounded-xl px-4 py-3 text-left relative overflow-hidden"
                  style={{
                    background: 'var(--surface2)',
                    borderLeft: `3px solid ${scoreColor(overallScore)}`,
                  }}
                >
                  {/* Subtle glow bleed from the left border */}
                  <div
                    className="absolute inset-y-0 left-0 w-12 pointer-events-none"
                    style={{
                      background: `linear-gradient(to right, ${scoreColor(overallScore)}18, transparent)`,
                    }}
                  />
                  <p className="relative text-[13px] italic leading-relaxed m-0" style={{ color: 'var(--text)' }}>
                    &ldquo;{result.analysis.verdict}&rdquo;
                  </p>
                </div>
              </div>

              {/* ── Plus / aandachtspunten — stacked mobile, side-by-side sm+ */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Pluspunten */}
                <div className="glass rounded-2xl p-4">
                  <h3 className="text-[13px] font-bold flex items-center gap-1.5 m-0 mb-3" style={{ color: 'var(--green)' }}>
                    <CheckCircle2 size={14} /> Pluspunten
                  </h3>
                  <ul className="m-0 p-0 list-none space-y-2">
                    {result.analysis.pluspunten.map((p, i) => (
                      <li key={i} className="text-[13px] leading-snug flex gap-2" style={{ color: 'var(--text)' }}>
                        <span className="shrink-0 mt-[3px] text-[10px]" style={{ color: 'var(--green)' }}>●</span>
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Aandachtspunten */}
                <div className="glass rounded-2xl p-4">
                  <h3 className="text-[13px] font-bold flex items-center gap-1.5 m-0 mb-3" style={{ color: 'var(--yellow)' }}>
                    <TrendingDown size={14} /> Aandachtspunten
                  </h3>
                  <ul className="m-0 p-0 list-none space-y-2">
                    {result.analysis.aandachtspunten.map((a, i) => (
                      <li key={i} className="text-[13px] leading-snug flex gap-2" style={{ color: 'var(--text)' }}>
                        <span className="shrink-0 mt-[3px] text-[10px]" style={{ color: 'var(--yellow)' }}>●</span>
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* ── Salarisschatting ────────────────────────────── */}
              {result.analysis.salarisschatting && (
                <div className="glass rounded-2xl px-5 py-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--accent-dim)' }}>
                    <Banknote size={16} style={{ color: 'var(--accent-bright)' }} />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider m-0 mb-0.5" style={{ color: 'var(--text3)' }}>Salarisschatting</p>
                    <p className="text-[14px] font-bold m-0" style={{ color: 'var(--text)' }}>{result.analysis.salarisschatting}</p>
                  </div>
                </div>
              )}

              {/* ── Vaardigheidsgap ─────────────────────────────── */}
              {result.analysis.vaardigheidsgap && result.analysis.vaardigheidsgap.length > 0 && (
                <div className="glass rounded-2xl px-5 py-4">
                  <h3 className="text-[13px] font-bold flex items-center gap-1.5 m-0 mb-3" style={{ color: 'var(--red)' }}>
                    <Zap size={13} /> Skills te ontwikkelen
                  </h3>
                  <ul className="m-0 p-0 list-none flex flex-wrap gap-2">
                    {result.analysis.vaardigheidsgap.map((s, i) => (
                      <li
                        key={i}
                        className="text-[12px] font-medium px-2.5 py-1 rounded-lg"
                        style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.2)' }}
                      >
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* ── Gespreksopeners ──────────────────────────────── */}
              {result.analysis.gespreksopeners && result.analysis.gespreksopeners.length > 0 && (
                <div className="glass rounded-2xl px-5 py-4">
                  <h3 className="text-[13px] font-bold flex items-center gap-1.5 m-0 mb-3" style={{ color: 'var(--text)' }}>
                    <MessageSquare size={13} style={{ color: 'var(--accent)' }} /> Gespreksvoorbereiding
                  </h3>
                  <ul className="m-0 p-0 list-none space-y-2">
                    {result.analysis.gespreksopeners.map((g, i) => (
                      <li key={i} className="text-[13px] leading-snug flex gap-2" style={{ color: 'var(--text2)' }}>
                        <span className="shrink-0 font-bold tabular-nums text-[11px] mt-[2px]" style={{ color: 'var(--accent-bright)' }}>{i + 1}.</span>
                        {g}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* ── Persoonlijk advies card ──────────────────────── */}
              <div className="glass rounded-2xl px-5 py-5">
                <h3 className="text-[14px] font-bold flex items-center gap-1.5 m-0 mb-3" style={{ color: 'var(--text)' }}>
                  <Lightbulb size={15} style={{ color: 'var(--accent)' }} /> Persoonlijk advies
                </h3>
                <p className="text-[14px] leading-relaxed m-0" style={{ color: 'var(--text)' }}>
                  {result.analysis.advies}
                </p>
              </div>

              {/* ── Action row ───────────────────────────────────── */}
              <div className="grid grid-cols-2 gap-3 pb-2">
                <motion.button
                  whileTap={{ scale: 0.93 }}
                  onClick={reset}
                  className="btn btn-secondary btn-lg rounded-2xl h-[48px]"
                >
                  <RotateCcw size={14} /> Nieuwe analyse
                </motion.button>
                <motion.button
                  whileTap={bewaarState === 'idle' ? { scale: 0.93 } : {}}
                  onClick={bewaarJob}
                  disabled={bewaarState === 'saving'}
                  className="btn btn-lg rounded-2xl h-[48px] relative overflow-hidden"
                  style={{ background: 'var(--green-dim)', color: 'var(--green)', border: '1px solid var(--green)', boxShadow: 'none' }}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {bewaarState === 'saved' ? (
                      <motion.span
                        key="check"
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                        className="flex items-center gap-1.5"
                      >
                        <CheckCircle2 size={16} /> Bewaard
                      </motion.span>
                    ) : (
                      <motion.span
                        key="label"
                        initial={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center gap-1.5"
                      >
                        <Bookmark size={14} /> Bewaar
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
                <motion.a
                  whileTap={{ scale: 0.93 }}
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary btn-lg rounded-2xl h-[48px] no-underline"
                >
                  <Link2 size={14} /> Vacature
                </motion.a>
                <motion.button
                  whileTap={removeState === 'idle' ? { scale: 0.93 } : {}}
                  onClick={removeJob}
                  disabled={removeState === 'removing'}
                  className="btn btn-lg rounded-2xl h-[48px]"
                  style={{ background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid var(--red-glow)', boxShadow: 'none' }}
                >
                  <Trash2 size={14} /> Verwijder
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Toast ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.msg}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: 'fixed',
              bottom: 'calc(env(safe-area-inset-bottom) + 5rem)',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 200,
              background: toast.ok ? 'var(--green-dim)' : 'var(--red-dim)',
              border: `1px solid ${toast.ok ? 'var(--green)' : 'var(--red)'}`,
              borderRadius: '0.875rem',
              padding: '0.75rem 1.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
            }}
          >
            {toast.ok
              ? <CheckCircle2 size={16} style={{ color: 'var(--green)', flexShrink: 0 }} />
              : <AlertTriangle size={16} style={{ color: 'var(--red)', flexShrink: 0 }} />
            }
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: toast.ok ? 'var(--green)' : 'var(--red)' }}>
              {toast.msg}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
