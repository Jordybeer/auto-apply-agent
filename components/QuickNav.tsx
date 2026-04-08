'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

type Tab = 'home' | 'queue' | 'saved' | 'applied';

const TAB_CONFIG: {
  key: Tab;
  label: string;
  emoji?: string;
  accent: string;
  accentBg: string;
  href: string;
}[] = [
  { key: 'home',    label: '🏠',            accent: '#6366f1', accentBg: 'rgba(99,102,241,0.18)',  href: '/'                  },
  { key: 'queue',   label: 'Wachtrij',      accent: '#6366f1', accentBg: 'rgba(99,102,241,0.18)',  href: '/queue?tab=queue'   },
  { key: 'saved',   label: 'Bewaard',       accent: '#f59e0b', accentBg: 'rgba(245,158,11,0.18)',  href: '/queue?tab=saved'   },
  { key: 'applied', label: 'Gesolliciteerd',accent: '#22c55e', accentBg: 'rgba(34,197,94,0.18)',   href: '/queue?tab=applied' },
];

export default function QuickNav() {
  const router   = useRouter();
  const pathname = usePathname();
  const [counts, setCounts] = useState<Record<'queue' | 'saved' | 'applied', number>>({ queue: 0, saved: 0, applied: 0 });

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

  const activeKey: Tab =
    pathname === '/'               ? 'home'
    : pathname.includes('saved')   ? 'saved'
    : pathname.includes('applied') ? 'applied'
    : pathname.startsWith('/queue')? 'queue'
    : 'home';

  return (
    <div
      className="flex items-center rounded-2xl p-1 gap-1"
      style={{ background: 'var(--surface2)' }}
      role="navigation"
      aria-label="Snelle navigatie"
    >
      {TAB_CONFIG.map(tab => {
        const isActive = activeKey === tab.key;
        const count = tab.key !== 'home' ? counts[tab.key as 'queue' | 'saved' | 'applied'] : 0;
        return (
          <button
            key={tab.key}
            onClick={() => router.push(tab.href)}
            aria-label={tab.key === 'home' ? 'Home' : tab.label}
            className="relative flex items-center justify-center gap-1.5 rounded-xl text-sm font-semibold active:scale-95 transition-transform"
            style={{
              color: isActive ? tab.accent : 'var(--text2)',
              isolation: 'isolate',
              height: 40,
              /* Home pill is narrower (just emoji), others share equal flex */
              flex: tab.key === 'home' ? '0 0 44px' : '1',
              padding: '0 10px',
            }}
          >
            {isActive && (
              <motion.span
                layoutId="quicknav-pill"
                className="absolute inset-0 rounded-xl"
                style={{ background: tab.accentBg, border: `1px solid ${tab.accent}55`, zIndex: 0, pointerEvents: 'none' }}
                transition={{ type: 'spring', damping: 26, stiffness: 380 }}
              />
            )}
            <span className="relative flex items-center gap-1.5" style={{ zIndex: 1 }}>
              {tab.label}
              {count > 0 && (
                <motion.span
                  key={count}
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="inline-flex items-center justify-center min-w-[20px] h-[20px] rounded-full text-[11px] font-bold px-1.5"
                  style={{ background: isActive ? tab.accent : 'var(--border)', color: isActive ? '#fff' : 'var(--text2)' }}
                >
                  {count}
                </motion.span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
