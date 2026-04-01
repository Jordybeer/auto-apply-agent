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
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const submit = async () => {
    if (!title.trim() || !company.trim()) {
      setError('Functie en bedrijf zijn verplicht.');
      return;
    }
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

  const inputStyle = {
    background: 'var(--surface2)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
  };

  return (
    <AnimatePresence>
      {/* Overlay stops at the navbar top edge */}
      <motion.div
        key="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-x-0 top-0 z-50 flex items-end justify-center"
        style={{
          bottom: 'var(--navbar-h)',
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
        }}
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
            border: '1px solid var(--border-bright)',
            maxHeight: 'calc(100dvh - var(--navbar-h) - env(safe-area-inset-top, 0px))',
          }}
        >
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
            <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border)' }} />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-2 pb-4 flex-shrink-0">
            <p className="font-bold text-base" style={{ color: 'var(--text)' }}>Manueel toevoegen</p>
            <button
              onClick={onClose}
              className="flex items-center justify-center w-8 h-8 rounded-full"
              style={{ background: 'var(--surface2)', color: 'var(--text2)' }}
              aria-label="Sluiten"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scrollable form */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 flex flex-col gap-3 pb-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: 'var(--text2)' }}>Functie *</label>
              <input
                value={title} onChange={e => setTitle(e.target.value)}
                placeholder="bv. Frontend Developer"
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={inputStyle}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: 'var(--text2)' }}>Bedrijf *</label>
              <input
                value={company} onChange={e => setCompany(e.target.value)}
                placeholder="bv. Acme BV"
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={inputStyle}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: 'var(--text2)' }}>URL (optioneel)</label>
              <input
                value={url} onChange={e => setUrl(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={inputStyle}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: 'var(--text2)' }}>Beschrijving (optioneel)</label>
              <textarea
                value={desc} onChange={e => setDesc(e.target.value)}
                rows={4}
                placeholder="Plak hier de vacaturetekst voor betere AI-matching\u2026"
                className="w-full rounded-xl px-3 py-2.5 text-sm resize-none outline-none"
                style={inputStyle}
              />
            </div>

            <button
              onClick={() => setUseGroq(v => !v)}
              className="flex items-center gap-2 py-2 text-sm font-medium"
              style={{ color: useGroq ? 'var(--accent)' : 'var(--text2)' }}
            >
              <Sparkles className="w-4 h-4" />
              {useGroq ? 'AI-brief genereren \u2713' : 'AI-brief genereren (uit)'}
            </button>
          </div>

          {/* Error */}
          {error && (
            <p className="mx-5 mb-2 text-xs flex-shrink-0" style={{ color: 'var(--red)' }}>{error}</p>
          )}

          {/* Sticky footer */}
          <div
            className="flex-shrink-0 px-5 pt-3 flex gap-2"
            style={{
              borderTop: '1px solid var(--border)',
              background: 'var(--surface)',
              paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))',
            }}
          >
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-2xl text-sm font-semibold"
              style={{ background: 'var(--surface2)', color: 'var(--text2)' }}
            >
              Annuleer
            </button>
            <button
              onClick={submit}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold disabled:opacity-40"
              style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--accent)', border: '1px solid rgba(99,102,241,0.3)' }}
            >
              {saving
                ? <RefreshCw className="w-4 h-4 animate-spin" />
                : <PlusCircle className="w-4 h-4" />}
              {saving ? 'Bezig\u2026' : 'Toevoegen'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
