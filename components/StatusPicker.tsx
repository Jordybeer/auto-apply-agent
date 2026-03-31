'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

const STATUSES = [
  { value: 'applied',     label: 'Gesolliciteerd', color: 'var(--green)',  bg: 'rgba(74,222,128,0.12)',  border: 'rgba(74,222,128,0.3)'  },
  { value: 'in_progress', label: 'In behandeling', color: 'var(--yellow)', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.3)'  },
  { value: 'rejected',    label: 'Afgewezen',      color: 'var(--red)',    bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.3)' },
];

interface Props {
  current: string;
  disabled?: boolean;
  onChange: (status: string) => void;
}

export default function StatusPicker({ current, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const active = STATUSES.find(s => s.value === current) ?? STATUSES[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        disabled={disabled}
        className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold disabled:opacity-40"
        style={{ background: active.bg, color: active.color, border: `1px solid ${active.border}` }}
      >
        {active.label}
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="dropdown"
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-8 z-30 rounded-2xl overflow-hidden flex flex-col"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', minWidth: '160px', boxShadow: 'var(--shadow)' }}
          >
            {STATUSES.map(s => (
              <button
                key={s.value}
                onClick={() => { onChange(s.value); setOpen(false); }}
                className="flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-left"
                style={{
                  color: s.value === current ? s.color : 'var(--text)',
                  background: s.value === current ? s.bg : 'transparent',
                }}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                {s.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
