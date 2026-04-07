'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Link2,
  Sparkles,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  RotateCcw,
  UserCircle2,
  X,
  ChevronDown,
} from 'lucide-react';

interface ScoreCategory {
  score: number;
  toelichting: string;
}

interface Analysis {
  titel: string;
  bedrijf: string;
  overall_score: number;
  verdict: string;
  scores: {
    vaardigheden: ScoreCategory;
    ervaring: ScoreCategory;
    locatie: ScoreCategory;
    groeipotentieel: ScoreCategory;
    cultuur: ScoreCategory;
  };
  pluspunten: string[];
  aandachtspunten: string[];
  advies: string;
}

const SCORE_LABELS: Record<string, string> = {
  vaardigheden: 'Vaardigheden',
  ervaring: 'Ervaring',
  locatie: 'Locatie',
  groeipotentieel: 'Groeipotentieel',
  cultuur: 'Cultuurfit',
};

function scoreColor(score: number): string {
  if (score >= 75) return 'var(--green)';
  if (score >= 50) return 'var(--yellow)';
  return 'var(--red)';
}

function ScoreBar({ score, label, toelichting }: { score: number; label: string; toelichting: string }) {
  return (
    <div style={{ marginBottom: 'var(--space-4, 1rem)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: scoreColor(score) }}>{score}/100</span>
      </div>
      <div style={{
        height: 7,
        borderRadius: 99,
        background: 'var(--surface2, rgba(255,255,255,0.07))',
        overflow: 'hidden',
        marginBottom: 6,
      }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          style={{ height: '100%', borderRadius: 99, background: scoreColor(score) }}
        />
      </div>
      <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, margin: 0 }}>{toelichting}</p>
    </div>
  );
}

function VerdictBadge({ score }: { score: number }) {
  const label = score >= 75 ? 'Sterke match' : score >= 50 ? 'Matige match' : 'Zwakke match';
  const color = scoreColor(score);
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '4px 12px',
      borderRadius: 99,
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: 0.4,
      border: `1.5px solid ${color}`,
      color,
      background: `${color}18`,
      textTransform: 'uppercase',
    }}>
      {score >= 75 ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
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
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: 'var(--accent-dim)',
        border: '1px solid var(--accent)',
        borderRadius: 12,
        padding: '10px 14px',
        marginBottom: 16,
      }}
    >
      <UserCircle2 size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
      <p style={{ flex: 1, fontSize: 13, color: 'var(--text)', margin: 0, lineHeight: 1.5 }}>
        <strong>Profiel onvolledig</strong> — Vul je CV en sleutelwoorden in voor nauwkeurigere analyses.{' '}
        <a
          href="/profiel"
          style={{
            color: 'var(--accent)',
            fontWeight: 600,
            textDecoration: 'underline',
            textUnderlineOffset: 2,
          }}
        >
          Profiel aanvullen →
        </a>
      </p>
      <button
        onClick={onDismiss}
        aria-label="Banner sluiten"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text2)',
          padding: 2,
          flexShrink: 0,
          lineHeight: 0,
        }}
      >
        <X size={15} />
      </button>
    </motion.div>
  );
}

export default function AnalyseClient() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ analysis: Analysis; url: string } | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [contextKeywords, setContextKeywords] = useState('');
  const [contextCity, setContextCity] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/profiel')
      .then(r => r.json())
      .then(data => {
        const profile = data?.profile ?? data;
        const isIncomplete = !profile?.cv_text?.trim() || !profile?.keywords?.length;
        setShowBanner(isIncomplete);
        // Pre-fill context fields from profile if available
        if (profile?.keywords?.length) setContextKeywords(profile.keywords.join(', '));
        if (profile?.city) setContextCity(profile.city);
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

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
      if (!res.ok || !data.success) {
        setError(data.error ?? 'Er is iets misgegaan.');
      } else {
        setResult({ analysis: data.analysis, url: data.url });
      }
    } catch {
      setError('Netwerkfout. Probeer opnieuw.');
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setResult(null);
    setError(null);
    setUrl('');
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  const overallScore = result?.analysis?.overall_score ?? 0;

  return (
    <main className="page-shell">
      <div>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          style={{ marginBottom: 24 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Sparkles size={18} style={{ color: 'var(--accent)' }} />
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
              Vacature analyseren
            </h1>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text2)', margin: 0 }}>
            Plak een vacaturelink en ontdek hoe goed hij bij jou past.
          </p>
        </motion.div>

        <AnimatePresence>
          {showBanner && (
            <ProfileBanner key="profile-banner" onDismiss={() => setShowBanner(false)} />
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {!result && (
            <motion.form
              key="form"
              onSubmit={handleSubmit}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              style={{
                background: 'var(--surface)',
                borderRadius: 16,
                padding: '20px',
                marginBottom: 20,
                border: '1px solid var(--border)',
              }}
            >
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
                Vacature URL
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: 'var(--surface2)',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  padding: '0 12px',
                }}>
                  <Link2 size={15} style={{ color: 'var(--text2)', flexShrink: 0 }} />
                  <input
                    ref={inputRef}
                    type="url"
                    required
                    placeholder="https://www.jobat.be/nl/jobs/..."
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    style={{
                      flex: 1,
                      background: 'none',
                      border: 'none',
                      outline: 'none',
                      fontSize: 14,
                      color: 'var(--text)',
                      padding: '10px 0',
                    }}
                  />
                </div>
                <motion.button
                  type="submit"
                  disabled={loading || !url.trim()}
                  whileTap={{ scale: 0.93 }}
                  style={{
                    background: loading || !url.trim() ? 'var(--surface2)' : 'var(--accent)',
                    color: loading || !url.trim() ? 'var(--text2)' : '#fff',
                    border: 'none',
                    borderRadius: 10,
                    padding: '0 18px',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: loading || !url.trim() ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    height: 42,
                    transition: 'background 0.18s',
                    flexShrink: 0,
                  }}
                >
                  {loading ? (
                    <>
                      <motion.span
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                        style={{ display: 'inline-block' }}
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

              {/* Optional context override */}
              <button
                type="button"
                onClick={() => setShowContext(v => !v)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  marginTop: 12,
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text2)',
                }}
              >
                <ChevronDown
                  size={13}
                  style={{ transition: 'transform 0.2s', transform: showContext ? 'rotate(180deg)' : 'rotate(0deg)' }}
                />
                {showContext ? 'Context verbergen' : 'Profielcontext aanpassen'}
              </button>

              <AnimatePresence>
                {showContext && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 4 }}>
                          Doelfuncties / zoekwoorden
                        </label>
                        <input
                          type="text"
                          value={contextKeywords}
                          onChange={e => setContextKeywords(e.target.value)}
                          placeholder="bv. IT helpdesk, servicedesk, support"
                          className="field-input"
                          style={{ fontSize: 13 }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 4 }}>
                          Voorkeurslocatie
                        </label>
                        <input
                          type="text"
                          value={contextCity}
                          onChange={e => setContextCity(e.target.value)}
                          placeholder="bv. Antwerpen"
                          className="field-input"
                          style={{ fontSize: 13 }}
                        />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {error && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={{ marginTop: 10, fontSize: 13, color: 'var(--red)' }}
                >
                  {error}
                </motion.p>
              )}

              <p style={{ marginTop: 10, fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
                De analyse gebruikt jouw CV en profielinstellingen.
              </p>
            </motion.form>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {loading && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                textAlign: 'center',
                padding: '40px 20px',
                color: 'var(--text2)',
                fontSize: 14,
              }}
            >
              <motion.div
                animate={{ scale: [1, 1.08, 1] }}
                transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
                style={{ marginBottom: 12 }}
              >
                <Sparkles size={28} style={{ color: 'var(--accent)', margin: '0 auto' }} />
              </motion.div>
              <p style={{ margin: 0, fontWeight: 500 }}>Vacature ophalen en analyseren&hellip;</p>
              <p style={{ margin: '4px 0 0', fontSize: 12 }}>Dit duurt enkele seconden</p>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {result && !loading && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              <div style={{
                background: 'var(--surface)',
                borderRadius: 16,
                padding: '24px 20px',
                marginBottom: 12,
                border: '1px solid var(--border)',
                textAlign: 'center',
              }}>
                <VerdictBadge score={overallScore} />
                <motion.div
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.1, type: 'spring', stiffness: 280, damping: 20 }}
                  style={{
                    fontSize: 64,
                    fontWeight: 800,
                    color: scoreColor(overallScore),
                    lineHeight: 1,
                    margin: '16px 0 4px',
                  }}
                >
                  {overallScore}
                </motion.div>
                <p style={{ fontSize: 12, color: 'var(--text2)', margin: '0 0 12px' }}>/ 100</p>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>
                  {result.analysis.titel}
                </h2>
                <p style={{ fontSize: 13, color: 'var(--text2)', margin: '0 0 14px' }}>{result.analysis.bedrijf}</p>
                <p style={{
                  fontSize: 14,
                  color: 'var(--text)',
                  fontStyle: 'italic',
                  lineHeight: 1.5,
                  margin: 0,
                  padding: '12px 16px',
                  background: 'var(--surface2)',
                  borderRadius: 10,
                  borderLeft: `3px solid ${scoreColor(overallScore)}`,
                  textAlign: 'left',
                }}>
                  &ldquo;{result.analysis.verdict}&rdquo;
                </p>
              </div>

              <div style={{
                background: 'var(--surface)',
                borderRadius: 16,
                padding: '20px',
                marginBottom: 12,
                border: '1px solid var(--border)',
              }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <TrendingUp size={15} style={{ color: 'var(--accent)' }} /> Scoreverdeling
                </h3>
                {Object.entries(result.analysis.scores).map(([key, val]) => (
                  <ScoreBar
                    key={key}
                    label={SCORE_LABELS[key] ?? key}
                    score={(val as ScoreCategory).score}
                    toelichting={(val as ScoreCategory).toelichting}
                  />
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div style={{
                  background: 'var(--surface)',
                  borderRadius: 16,
                  padding: 16,
                  border: '1px solid var(--border)',
                }}>
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <CheckCircle2 size={14} /> Pluspunten
                  </h3>
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                    {result.analysis.pluspunten.map((p, i) => (
                      <li key={i} style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.55, marginBottom: 6, paddingLeft: 10, position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 0, color: 'var(--green)' }}>&middot;</span>
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
                <div style={{
                  background: 'var(--surface)',
                  borderRadius: 16,
                  padding: 16,
                  border: '1px solid var(--border)',
                }}>
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--yellow)', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <TrendingDown size={14} /> Aandachtspunten
                  </h3>
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                    {result.analysis.aandachtspunten.map((a, i) => (
                      <li key={i} style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.55, marginBottom: 6, paddingLeft: 10, position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 0, color: 'var(--yellow)' }}>&middot;</span>
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div style={{
                background: 'var(--surface)',
                borderRadius: 16,
                padding: '20px',
                marginBottom: 16,
                border: '1px solid var(--border)',
              }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Lightbulb size={15} style={{ color: 'var(--accent)' }} /> Persoonlijk advies
                </h3>
                <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.65, margin: 0 }}>
                  {result.analysis.advies}
                </p>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <motion.button
                  whileTap={{ scale: 0.93 }}
                  onClick={reset}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    background: 'var(--surface2)',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: '10px 16px',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <RotateCcw size={14} /> Nieuwe analyse
                </motion.button>
                <motion.a
                  whileTap={{ scale: 0.93 }}
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    background: 'var(--accent)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 10,
                    padding: '10px 16px',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                    textDecoration: 'none',
                  }}
                >
                  <Link2 size={14} /> Vacature bekijken
                </motion.a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
