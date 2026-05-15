'use client';

import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import {
  type SearchMode,
  MODE_LABELS,
  MODE_DESCRIPTIONS,
  MODE_ICONS,
} from '@/lib/search-mode';

const MODES: SearchMode[] = ['career', 'student', 'pivot'];

interface Props {
  value:    SearchMode;
  onChange: (mode: SearchMode) => void;
  disabled?: boolean;
}

export default function SearchModeSelector({ value, onChange, disabled = false }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="Zoekmodus kiezen"
      style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      {MODES.map((mode) => {
        const active = value === mode;
        return (
          <motion.button
            key={mode}
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(mode)}
            whileTap={{ scale: disabled ? 1 : 0.97 }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '14px 16px',
              borderRadius: 16,
              border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
              background: active ? 'var(--accent-dim)' : 'var(--surface)',
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.5 : 1,
              textAlign: 'left',
              width: '100%',
              transition: 'background 0.18s ease, border-color 0.18s ease, opacity 0.18s ease',
              boxShadow: active ? '0 0 0 3px var(--accent-glow)' : 'none',
            }}
          >
            <span
              style={{ fontSize: 24, flexShrink: 0, lineHeight: 1, filter: active ? 'none' : 'grayscale(0.4)' }}
              aria-hidden="true"
            >
              {MODE_ICONS[mode]}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: active ? 'var(--accent-bright)' : 'var(--text)', marginBottom: 2 }}>
                {MODE_LABELS[mode]}
              </span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--text2)', lineHeight: 1.4 }}>
                {MODE_DESCRIPTIONS[mode]}
              </span>
            </span>
            {active && (
              <motion.span
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                style={{ flexShrink: 0 }}
              >
                <CheckCircle2 size={18} style={{ color: 'var(--accent-bright)' }} />
              </motion.span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
