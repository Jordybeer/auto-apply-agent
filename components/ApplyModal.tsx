'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Sparkles, AlertTriangle, Loader2 } from 'lucide-react';

interface Props {
  applicationId: string;
  jobTitle: string;
  company: string;
  initialLetter: string | null;
  initialBullets: string[] | null;
  groqSkipped?: boolean;
  onClose: () => void;
  onConfirmed: (id: string) => void;
}

export default function ApplyModal({
  applicationId,
  jobTitle,
  company,
  initialLetter,
  initialBullets,
  groqSkipped,
  onClose,
  onConfirmed,
}: Props) {
  const [letter, setLetter]         = useState(initialLetter ?? '');
  const [saving, setSaving]         = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError]     = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => { setLetter(initialLetter ?? ''); }, [initialLetter]);

  // ── Generate brief via Groq ──────────────────────────────────────────
  // Calls POST /api/apply which runs the full Groq pipeline:
  //   temperature 0.72, llama-3.3-70b-versatile, 230-word Dutch letter,
  //   anti-cliché rules, CV-context, contact-person scraping.
  // The route validates status === 'saved', so the card must already be saved.
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
      if (!res.ok) {
        setGenError(data.error ?? `Fout ${res.status}`);
        return;
      }
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

  // ── Confirm / save ───────────────────────────────────────────────────
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
      onConfirmed(applicationId);
      onClose();
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Fout bij opslaan');
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
          {/* Drag handle */}
          <div className="mx-auto w-10 h-1 rounded-full" style={{ background: 'var(--border)' }} />

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
              <span>Groq API-sleutel ontbreekt — brief niet automatisch gegenereerd. Druk op Genereer om het opnieuw te proberen.</span>
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

          {/* fix #2: whiteSpace pre-wrap ensures \n\n paragraph breaks from the
              Groq-generated cover letter render as visible blank lines instead
              of collapsing into a single wall of text. */}
          <textarea
            value={letter}
            onChange={e => setLetter(e.target.value)}
            rows={12}
            placeholder="Schrijf hier je motivatiebrief of druk op \u2018Genereer brief\u2019 voor een AI-voorstel\u2026"
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

          {/* Actions */}
          <div className="flex items-center gap-3">
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
