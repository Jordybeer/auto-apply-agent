'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * Reusable modal overlay + dialog shell.
 * Renders into document.body via a portal so it is never clipped by
 * parent overflow or z-index stacking contexts.
 *
 * Usage:
 *   <ModalShell onClose={() => setOpen(false)} aria-label="My dialog">
 *     …content…
 *   </ModalShell>
 */
export default function ModalShell({
  onClose,
  children,
  'aria-label': ariaLabel,
}: {
  onClose: () => void;
  children: React.ReactNode;
  'aria-label'?: string;
}) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return createPortal(
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <div
        className="modal-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
