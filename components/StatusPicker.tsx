'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  const [open, setOpen]         = useState(false);
  const [coords, setCoords]     = useState({ top: 0, right: 0 });
  const triggerRef              = useRef<HTMLButtonElement>(null);
  const active = STATUSES.find(s => s.value === current) ?? STATUSES[0];

  // Recalculate position whenever dropdown opens or window scrolls/resizes
  useEffect(() => {
    if (!open) return;
    function update() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setCoords({
        top:   rect.bottom + 6,
        right: window.innerWidth - rect.right,
      });
    }
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const dropdown = (
    <AnimatePresence>
      {open && (
        <motion.div
          key="status-dropdown"
          role="listbox"
          aria-label="Status kiezen"
          initial={{ opacity: 0, y: -4, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.97 }}
          transition={{ duration: 0.15 }}
          style={{
            position: 'fixed',
            top:   coords.top,
            right: coords.right,
            zIndex: 400,
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            borderRadius: '1rem',
            minWidth: '172px',
            boxShadow: 'var(--shadow-lg)',
            overflow: 'hidden',
          }}
        >
          {STATUSES.map(s => (
            <button
              key={s.value}
              role="option"
              aria-selected={s.value === current}
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onChange(s.value); setOpen(false); }}
              className="flex items-center gap-2.5 px-4 py-3 text-xs font-medium text-left w-full"
              style={{
                color:      s.value === current ? s.color : 'var(--text)',
                background: s.value === current ? s.bg    : 'transparent',
              }}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
              {s.label}
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={() => setOpen(v => !v)}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-full text-xs font-semibold disabled:opacity-40 active:scale-95 transition-transform"
        style={{ background: active.bg, color: active.color, border: `1px solid ${active.border}` }}
      >
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: active.color }} />
        {active.label}
        <ChevronDown className={`w-3 h-3 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>

      {typeof window !== 'undefined' && createPortal(dropdown, document.body)}
    </div>
  );
}
