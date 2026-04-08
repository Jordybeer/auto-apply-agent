'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

type Tab = 'queue' | 'saved' | 'applied';

const TAB_CONFIG: { key: Tab; label: string; accent: string; accentBg: string; accentBorder: string }[] = [
  { key: 'queue',   label: 'Wachtrij',      accent: '#6366f1', accentBg: 'rgba(99,102,241,0.18)',  accentBorder: 'rgba(99,102,241,0.35)' },
  { key: 'saved',   label: 'Bewaard',       accent: '#f59e0b', accentBg: 'rgba(245,158,11,0.18)', accentBorder: 'rgba(245,158,11,0.35)' },
  { key: 'applied', label: 'Gesolliciteerd',accent: '#22c55e', accentBg: 'rgba(34,197,94,0.18)',  accentBorder: 'rgba(34,197,94,0.35)'  },
];

export default function QuickNav() {
  const router = useRouter();
  const [counts, setCounts] = useState<Record<Tab, number>>({ queue: 0, saved: 0, applied: 0 });

  useEffect(() => {
    Promise.allSettled([
      fetch('/api/queue').then(r => r.json()),
      fetch('/api/saved').then(r => r.json()),
      fetch('/api/applied').then(r => r.json()),
    ]).then(([q, s, a]) => {
      setCounts({
        queue:   q.status === 'fulfilled' ? (q.value.applications ?? []).length : 0,
        saved:   s.status === 'fulfilled' ? (s.value.applications ?? s.value.items ?? []).length : 0,
        applied: a.status === 'fulfilled' ? (a.value.applications ?? a.value.items ?? []).length : 0,
      });
    });
  }, []);

  return (
    <div
      className="flex items-center rounded-2xl p-1 gap-1"
      style={{ background: 'var(--surface2)' }}
      role="navigation"
      aria-label="Snelle navigatie"
    >
      {TAB_CONFIG.map(tab => (
        <button
          key={tab.key}
          onClick={() => router.push(`/queue?tab=${tab.key}`)}
          className="relative flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold active:scale-95 transition-transform"
          style={{ color: 'var(--text2)', isolation: 'isolate' }}
        >
          <span className="relative flex items-center gap-2" style={{ zIndex: 1 }}>
            {tab.label}
            {counts[tab.key] > 0 && (
              <motion.span
                key={counts[tab.key]}
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="inline-flex items-center justify-center min-w-[20px] h-[20px] rounded-full text-[11px] font-bold px-1.5"
                style={{
                  background: tab.accent,
                  color: '#fff',
                }}
              >
                {counts[tab.key]}
              </motion.span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}
