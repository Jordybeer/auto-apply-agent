'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Sparkles, AlertTriangle, Loader2 } from 'lucide-react';

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
  jobs: Job | null;
}

interface Props {
  applicationId?: string;
  jobTitle?: string;
  company?: string;
  initialLetter?: string | null;
  initialBullets?: string[] | null;
  groqSkipped?: boolean;
  application?: Application;
  onClose: () => void;
  onApplied?: () => void;
  onConfirmed?: (id: string) => void;
}

export default function ApplyModal({
  applicationId: applicationIdProp,
  jobTitle: jobTitleProp,
  company: companyProp,
  initialLetter: initialLetterProp,
  initialBullets,
  groqSkipped,
  application,
  onClose,
  onApplied,
  onConfirmed,
}: Props) {
  const applicationId = applicationIdProp ?? application?.id ?? '';
  const jobTitle      = jobTitleProp     ?? application?.jobs?.title   ?? 'Onbekende functie';
  const company       = companyProp      ?? application?.jobs?.company ?? '\u2014';
  const initialLetter = initialLetterProp !== undefined
    ? initialLetterProp
    : (application?.cover_letter_draft ?? null);

  const [letter, setLetter]         = useState(initialLetter ?? '');
  const [saving, setSaving]         = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError]     = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => { setLetter(initialLetter ?? ''); }, [initialLetter]);

  const generate = async () => {
    setGenerating(true);
    setGenError(null);
    try {
      const res = await fetch('/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: applicationId }),
      });
      const data = await res.json();
      if (!res.ok) { setGenError(data.error ?? `Fout ${res.status}`); return; }
      if (data.cover_letter_draft) setLetter(data.cover_letter_draft);
      if (data.groq_skipped) {
        setGenError('Groq API-sleutel ontbreekt of generatie mislukt. Voer je sleutel in via Instellingen.');
      }
    } catch (e: unknown) {
      setGenError((e as Error).message ?? 'Generatie mislukt');
    } finally {
      setGenerating(false);
    }
  };

  const confirm = async () => {
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/apply', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application_id: applicationId,
          ...(letter.trim() ? { cover_letter_draft: letter } : {}),
          ...(initialBullets?.length ? { resume_bullets_draft: initialBullets } : {}),
          confirm: true,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onConfirmed?.(applicationId);
      onApplied?.();
      onClose();
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Fout bij opslaan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {/* Full-screen overlay, z-index above navbar (z-100) */}
      <motion.div
        key="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 flex items-center justify-center p-4"
        style={{ zIndex: 200, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      >
        <motion.div
          key="dialog"
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          /* Centered dialog: max width + constrained height so it never bleeds */
          className="w-full max-w-lg rounded-3xl flex flex-col"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border-bright)',
            maxHeight: 'min(90dvh, 720px)',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto overscroll-contain flex flex-col gap-4 p-5">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="font-bold text-base leading-snug" style={{ color: 'var(--text)' }}>
                  {jobTitle}
                </span>
                <span className="text-sm" style={{ color: 'var(--text2)' }}>{company}</span>
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

            {/* Groq skipped warning */}
            {groqSkipped && (
              <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs"
                style={{ background: 'rgba(251,191,36,0.1)', color: 'var(--yellow, #f59e0b)', border: '1px solid rgba(251,191,36,0.25)' }}>
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>Groq API-sleutel ontbreekt — brief niet automatisch gegenereerd.</span>
              </div>
            )}

            {/* Motivatiebrief label + generate button */}
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium" style={{ color: 'var(--text2)' }}>
                Motivatiebrief
              </label>
              <button
                onClick={generate}
                disabled={generating || saving}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-opacity disabled:opacity-40 active:scale-95"
                style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--accent, #6366f1)', border: '1px solid rgba(99,102,241,0.25)' }}
                aria-label="Genereer brief met AI"
              >
                {generating
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Sparkles className="w-3.5 h-3.5" />}
                {generating ? 'Genereren\u2026' : 'Genereer brief'}
              </button>
            </div>

            {/* Generation error */}
            {genError && (
              <div className="text-xs rounded-xl px-3 py-2"
                style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--red)', border: '1px solid rgba(248,113,113,0.25)' }}>
                {genError}
              </div>
            )}

            <textarea
              value={letter}
              onChange={e => setLetter(e.target.value)}
              rows={12}
              placeholder="Schrijf hier je motivatiebrief of druk op 'Genereer brief' voor een AI-voorstel\u2026"
              className="w-full rounded-2xl p-3.5 text-sm resize-none leading-relaxed focus:outline-none"
              style={{
                background: 'var(--surface2)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                whiteSpace: 'pre-wrap',
              }}
            />

            {/* Confirm error */}
            {error && (
              <div className="text-xs rounded-xl px-3 py-2"
                style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--red)', border: '1px solid rgba(248,113,113,0.25)' }}>
                {error}
              </div>
            )}
          </div>

          {/* Sticky footer — always visible, never behind keyboard or navbar */}
          <div
            className="flex-shrink-0 flex items-center gap-3 px-5 py-4 rounded-b-3xl"
            style={{
              borderTop: '1px solid var(--border)',
              background: 'var(--surface)',
            }}
          >
            <button
              onClick={onClose}
              disabled={saving || generating}
              className="flex-1 py-3 rounded-2xl text-sm font-semibold disabled:opacity-40"
              style={{ background: 'var(--surface2)', color: 'var(--text2)' }}
            >
              Annuleer
            </button>
            <button
              onClick={confirm}
              disabled={saving || generating}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold disabled:opacity-40 active:scale-95"
              style={{ background: 'var(--accent, #22c55e)', color: '#fff' }}
            >
              {saving
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Send className="w-4 h-4" />}
              Bevestig sollicitatie
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
