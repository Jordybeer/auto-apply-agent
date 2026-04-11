"use client";

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

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
  const [saveError, setSaveError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const saveBtnRef = useRef<HTMLButtonElement>(null);

  // Focus textarea when dialog opens
  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 50);
  }, [open]);

  // Close on Escape; basic focus trap on Tab
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); return; }
      if (e.key === 'Tab') {
        const focusable = [textareaRef.current, cancelBtnRef.current, saveBtnRef.current].filter(Boolean) as HTMLElement[];
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last  = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
          if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
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
      setSaveError('Kon notitie niet opslaan. Probeer opnieuw.');
    } finally {
      setSaving(false);
    }
  }

  const hasNote = note.trim().length > 0;

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={hasNote ? 'Notitie bewerken' : 'Notitie toevoegen'}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl text-xs font-semibold transition-colors active:scale-95"
        style={hasNote
          ? { background: 'var(--yellow-dim)', color: 'var(--yellow)', border: '1px solid rgba(251,191,36,0.3)' }
          : { background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }
        }
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
        Notitie
      </button>

      {open && createPortal(
        <div
          className="modal-overlay"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Notitie"
        >
          <div
            className="modal-dialog p-5 gap-3"
            onClick={e => e.stopPropagation()}
          >
            <p className="label-overline">Notitie</p>
            <textarea
              ref={textareaRef}
              value={note}
              onChange={(e) => { setNote(e.target.value); if (saveError) setSaveError(null); }}
              rows={5}
              placeholder="Voeg een persoonlijke notitie toe…"
              className="field-textarea"
            />
            {saveError && (
              <p className="text-xs" style={{ color: 'var(--red)' }}>{saveError}</p>
            )}
            <div className="flex gap-2">
              <button
                ref={cancelBtnRef}
                onClick={() => setOpen(false)}
                className="btn btn-lg btn-secondary"
              >
                Annuleer
              </button>
              <button
                ref={saveBtnRef}
                onClick={handleSave}
                disabled={saving}
                className="btn btn-lg btn-primary"
              >
                {saved ? '\u2713 Opgeslagen' : saving ? 'Opslaan\u2026' : 'Opslaan'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
