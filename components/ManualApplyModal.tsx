'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, PlusCircle, RefreshCw, Sparkles } from 'lucide-react';

interface Props {
  onClose: () => void;
  onCreated?: () => void;
  onAdded?: () => void;
}

export default function ManualApplyModal({ onClose, onCreated, onAdded }: Props) {
  const [title, setTitle]       = useState('');
  const [company, setCompany]   = useState('');
  const [url, setUrl]           = useState('');
  const [desc, setDesc]         = useState('');
  const [useGroq, setUseGroq]   = useState(true);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [showFieldErrors, setShowFieldErrors] = useState(false);

  const submit = async () => {
    if (!title.trim() || !company.trim()) {
      setError('Functie en bedrijf zijn verplicht.');
      setShowFieldErrors(true);
      return;
    }
    setShowFieldErrors(false);
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/applied', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          company: company.trim(),
          url: url.trim() || null,
          description: desc.trim() || '',
          generate_groq: useGroq,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      onCreated?.();
      onAdded?.();
      onClose();
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Fout bij aanmaken');
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
        className="modal-overlay modal-overlay--sheet"
        style={{ zIndex: 200 }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          key="dialog"
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 32 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="modal-dialog modal-dialog--sheet"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="modal-header">
            <p className="font-bold text-base text-primary">Manueel toevoegen</p>
            <button onClick={onClose} className="modal-close-btn" aria-label="Sluiten">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scrollbare body */}
          <div className="modal-body">
            <div className="flex flex-col gap-1">
              <label className="field-label">Functie *</label>
              <input
                value={title}
                onChange={e => { setTitle(e.target.value); if (showFieldErrors) setShowFieldErrors(false); }}
                placeholder="bv. Frontend Developer"
                className={`field-input${showFieldErrors && !title.trim() ? ' border-[var(--red)]' : ''}`}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="field-label">Bedrijf *</label>
              <input
                value={company}
                onChange={e => { setCompany(e.target.value); if (showFieldErrors) setShowFieldErrors(false); }}
                placeholder="bv. Acme BV"
                className={`field-input${showFieldErrors && !company.trim() ? ' border-[var(--red)]' : ''}`}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="field-label">URL (optioneel)</label>
              <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." className="field-input" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="field-label">Beschrijving (optioneel)</label>
              <textarea
                value={desc}
                onChange={e => setDesc(e.target.value)}
                rows={4}
                placeholder="Plak hier de vacaturetekst voor betere AI-matching\u2026"
                className="field-textarea"
              />
            </div>

            <button
              onClick={() => setUseGroq(v => !v)}
              className="flex items-center gap-2 py-2 text-sm font-medium"
              style={{ color: useGroq ? 'var(--accent-bright)' : 'var(--text2)' }}
            >
              <Sparkles className="w-4 h-4" />
              {useGroq ? 'AI-brief genereren ✓' : 'AI-brief genereren (uit)'}
            </button>
          </div>

          {error && <p className="mx-5 mb-2 text-xs flex-shrink-0 text-red">{error}</p>}

          {/* Sticky footer */}
          <div className="modal-footer">
            <button onClick={onClose} className="btn btn-lg btn-secondary">Annuleer</button>
            <button onClick={submit} disabled={saving} className="btn btn-lg btn-primary">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4" />}
              {saving ? 'Bezig\u2026' : 'Toevoegen'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
