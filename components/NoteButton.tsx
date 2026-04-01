"use client";

import { useState, useRef, useEffect } from 'react';

export default function NoteButton({
  applicationId,
  initialNote = '',
}: {
  applicationId: string;
  initialNote?: string;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(initialNote);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus textarea when popover opens
  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 50);
  }, [open]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/applications/${applicationId}/note`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });
      if (!res.ok) throw new Error('save failed');
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        setOpen(false);
      }, 900);
    } catch {
      alert('Kon notitie niet opslaan. Probeer opnieuw.');
    } finally {
      setSaving(false);
    }
  }

  const hasNote = note.trim().length > 0;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title={hasNote ? 'Notitie bewerken' : 'Notitie toevoegen'}
        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          hasNote
            ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 hover:bg-yellow-500/30'
            : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border border-zinc-700'
        }`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14" height="14"
          viewBox="0 0 24 24"
          fill={hasNote ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
        {hasNote ? 'Notitie' : 'Notitie'}
      </button>

      {open && (
        <div
          className="absolute bottom-full mb-2 left-0 z-50 w-72 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-3 flex flex-col gap-2"
          role="dialog"
          aria-label="Notitie"
        >
          <p className="text-xs text-zinc-400 font-medium uppercase tracking-wide">Notitie</p>
          <textarea
            ref={textareaRef}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder="Voeg een persoonlijke notitie toe..."
            className="w-full bg-zinc-800 text-zinc-100 text-sm rounded-lg p-2 border border-zinc-700 resize-none focus:outline-none focus:ring-1 focus:ring-zinc-500 placeholder:text-zinc-600"
          />
          <div className="flex justify-between items-center gap-2">
            <button
              onClick={() => setOpen(false)}
              className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded transition-colors"
            >
              Annuleer
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-xs bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {saved ? '✓ Opgeslagen' : saving ? 'Opslaan…' : 'Opslaan'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
