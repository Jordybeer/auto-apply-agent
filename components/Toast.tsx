'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Check, X, AlertCircle, Info } from 'lucide-react';
import type { Toast as ToastType } from '@/hooks/useToast';

const ICON = {
  success: <Check   size={15} strokeWidth={2.5} />,
  error:   <AlertCircle size={15} strokeWidth={2} />,
  info:    <Info    size={15} strokeWidth={2} />,
};

const COLOR: Record<ToastType['variant'], string> = {
  success: 'var(--green)',
  error:   'var(--red)',
  info:    'var(--accent)',
};

const DIM: Record<ToastType['variant'], string> = {
  success: 'var(--green-dim)',
  error:   'rgba(251,113,133,0.12)',
  info:    'var(--accent-dim)',
};

interface Props {
  toast: ToastType | null;
  onDismiss: () => void;
}

export default function Toast({ toast, onDismiss }: Props) {
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.id}
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 24, scale: 0.97, x: '-50%' }}
          animate={{ opacity: 1, y: 0,  scale: 1,    x: '-50%' }}
          exit={{    opacity: 0, y: 16, scale: 0.97, x: '-50%',
            transition: { duration: 0.2 } }}
          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          style={{
            position:             'fixed',
            bottom:               'calc(var(--navbar-h) + 12px)',
            left:                 '50%',
            width:                'min(calc(100vw - 32px), 380px)',
            zIndex:               'var(--z-pwa-toast)',
            background:           'var(--surface)',
            backdropFilter:       'saturate(220%) blur(56px)',
            WebkitBackdropFilter: 'saturate(220%) blur(56px)',
            border:               '1px solid var(--border-bright)',
            boxShadow:            'var(--shadow-lg), 0 0 0 1px rgba(255,255,255,0.04) inset',
            borderRadius:         '1.125rem',
            padding:              '0.75rem 0.875rem',
            display:              'flex',
            alignItems:           'center',
            gap:                  '0.625rem',
          }}
        >
          {/* Icon bubble */}
          <div style={{
            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: DIM[toast.variant],
            color: COLOR[toast.variant],
          }}>
            {ICON[toast.variant]}
          </div>

          {/* Message */}
          <p style={{
            flex: 1,
            fontSize: '0.8125rem',
            fontWeight: 500,
            color: 'var(--text)',
            lineHeight: 1.4,
          }}>
            {toast.message}
          </p>

          {/* Dismiss */}
          <button
            onClick={onDismiss}
            aria-label="Verberg"
            style={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              color: 'var(--text3)',
              cursor: 'pointer',
            }}
          >
            <X size={12} strokeWidth={2.5} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
