'use client';

import { motion } from 'framer-motion';
import { WifiOff } from 'lucide-react';

const EASE = [0.16, 1, 0.3, 1] as const;

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 gap-6 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="w-20 h-20 rounded-3xl flex items-center justify-center"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <WifiOff size={36} style={{ color: 'var(--text3)' }} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.1, ease: EASE }}
        className="space-y-2"
      >
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>
          Geen verbinding
        </h1>
        <p className="text-sm max-w-xs" style={{ color: 'var(--text3)' }}>
          Verbind opnieuw met het internet om jobtide te gebruiken.
          Eerder geladen vacatures zijn nog beschikbaar.
        </p>
      </motion.div>

      <motion.button
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2, ease: EASE }}
        whileTap={{ scale: 0.96 }}
        onClick={() => window.location.reload()}
        className="px-6 py-3 rounded-xl text-sm font-medium"
        style={{
          background: 'var(--accent-dim)',
          color: 'var(--accent-bright)',
          border: '1px solid var(--border)',
        }}
      >
        Opnieuw proberen
      </motion.button>
    </div>
  );
}
