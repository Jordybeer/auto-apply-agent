'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, RefreshCw, AlertTriangle } from 'lucide-react';

interface Props {
  applicationId: string;
  jobTitle: string;
  company: string;
  initialLetter: string | null;
  initialBullets: string[] | null;
  groqSkipped?: boolean;
  onClose: () => void;
  /** Called after a successful confirm so parent can remove the card */
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
  const [letter, setLetter]   = useState(initialLetter ?? '');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // Keep textarea in sync if parent re-opens with new data
  useEffect(() => { setLetter(initialLetter ?? ''); }, [initialLetter]);

  const confirm = async () => {
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/apply', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application_id: applicationId,
          // Only send fields that have actual content
          ...(letter.trim() ? { cover_letter_draft: letter } : {}),
          ...(initialBullets?.length ? { resume_bullets_draft: initialBullets } : {}),
          confirm: true,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onConfirmed(applicationId);
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Fout bij opslaan');
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
        style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          key="sheet"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="w-full max-w-lg rounded-t-3xl flex flex-col"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            maxHeight: '90dvh',
            paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px))',
          }}
        >
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border)' }} />
          </div>

          {/* Header */}
          <div className="flex items-start justify-between px-5 pt-2 pb-3">
            <div>
              <p className="font-bold text-base leading-tight" style={{ color: 'var(--text)' }}>{jobTitle}</p>
              <p className="text-sm" style={{ color: 'var(--text2)' }}>{company}</p>
            </div>
            <button
              onClick={onClose}
              className="flex items-center justify-center w-8 h-8 rounded-full"
              style={{ background: 'var(--surface2)', color: 'var(--text2)' }}
              aria-label="Sluiten"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Groq warning */}
          {groqSkipped && (
            <div className="mx-5 mb-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs"
              style={{ background: 'rgba(251,191,36,0.1)', color: 'var(--yellow)', border: '1px solid rgba(251,191,36,0.25)' }}>
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>Groq kon geen brief genereren. Je kan hieronder zelf schrijven of leeg laten.</span>
            </div>
          )}

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-5 pb-2">
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--text2)' }}>Motivatiebrief</p>
            <textarea
              value={letter}
              onChange={e => setLetter(e.target.value)}
              rows={10}
              placeholder="Schrijf hier je motivatiebrief…"
              className="w-full rounded-xl p-3 text-sm leading-relaxed resize-none outline-none"
              style={{
                background: 'var(--surface2)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
              }}
            />
          </div>

          {/* Error */}
          {error && (
            <p className="mx-5 mb-2 text-xs" style={{ color: 'var(--red)' }}>{error}</p>
          )}

          {/* Footer */}
          <div className="px-5 pt-2 flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-2xl text-sm font-semibold"
              style={{ background: 'var(--surface2)', color: 'var(--text2)' }}
            >
              Annuleer
            </button>
            <button
              onClick={confirm}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold disabled:opacity-40"
              style={{ background: 'rgba(74,222,128,0.15)', color: 'var(--green)', border: '1px solid rgba(74,222,128,0.3)' }}
            >
              {saving
                ? <RefreshCw className="w-4 h-4 animate-spin" />
                : <Send className="w-4 h-4" />}
              Bevestig sollicitatie
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
