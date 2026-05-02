'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type StatusData = { is_premium: boolean; scored_today: number; limit: number };

export default function FreeLimitBanner() {
  const [data, setData] = useState<StatusData | null>(null);

  useEffect(() => {
    fetch('/api/subscription/status')
      .then(r => r.json())
      .then((d: StatusData) => setData(d))
      .catch(() => {});
  }, []);

  const show = data && !data.is_premium && data.scored_today >= data.limit - 1;
  const exhausted = data && data.scored_today >= data.limit;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3 }}
          className="rounded-2xl px-3 py-2.5 flex items-center gap-2.5"
          style={{
            background: exhausted ? 'var(--red-dim)' : 'var(--yellow-dim)',
            border: `1px solid ${exhausted ? 'rgba(251,113,133,0.3)' : 'rgba(251,191,36,0.3)'}`,
          }}
        >
          <Zap size={15} style={{ color: exhausted ? 'var(--red)' : 'var(--yellow)', flexShrink: 0 }} />
          <p className="text-xs flex-1 leading-snug" style={{ color: exhausted ? 'var(--red)' : 'var(--yellow)' }}>
            {exhausted
              ? 'Daglimiet bereikt. Upgrade voor onbeperkt matchen.'
              : `Nog ${data!.limit - data!.scored_today} match${data!.limit - data!.scored_today === 1 ? '' : 'es'} vandaag. Upgrade voor onbeperkt.`
            }
          </p>
          <Link
            href="/upgrade"
            className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0"
            style={{
              background: exhausted ? 'var(--red)' : 'var(--yellow)',
              color: '#000',
            }}
          >
            Upgrade
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
