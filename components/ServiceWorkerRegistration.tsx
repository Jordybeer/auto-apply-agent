'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePushSubscription } from '@/lib/usePushSubscription';

export default function ServiceWorkerRegistration() {
  const [updateReady, setUpdateReady] = useState(false);
  const [reg, setReg] = useState<ServiceWorkerRegistration | null>(null);
  const { iosNotInstalled } = usePushSubscription();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((r) => {
        setReg(r);
        if (r.waiting) setUpdateReady(true);
        r.addEventListener('updatefound', () => {
          const newWorker = r.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setUpdateReady(true);
            }
          });
        });
        setInterval(() => r.update(), 60_000);
      })
      .catch((err) => console.warn('[SW] Registration failed:', err));

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });
  }, []);

  const applyUpdate = () => reg?.waiting?.postMessage('SKIP_WAITING');

  const bannerStyle: React.CSSProperties = {
    position: 'fixed',
    top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)',
    left: 0,
    right: 0,
    margin: '0 auto',
    zIndex: 9000,
    background: 'var(--surface)',
    border: '1px solid var(--border-bright)',
    borderRadius: '1rem',
    boxShadow: 'var(--shadow-lg)',
    padding: '0.75rem 1rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    width: 'min(calc(100vw - 2rem), 360px)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
  };

  const btnStyle: React.CSSProperties = {
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: '0.5rem',
    padding: '0.375rem 0.875rem',
    fontSize: '0.8125rem',
    fontWeight: 600,
    cursor: 'pointer',
    flexShrink: 0,
  };

  return (
    <AnimatePresence>
      {updateReady && (
        <motion.div
          key="update"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          style={bannerStyle}
        >
          <span style={{ flex: 1, fontSize: '0.875rem', color: 'var(--text)' }}>Nieuwe versie beschikbaar</span>
          <button onClick={applyUpdate} style={btnStyle}>Herlaad</button>
        </motion.div>
      )}

      {!updateReady && iosNotInstalled && (
        <motion.div
          key="ios-prompt"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          style={bannerStyle}
        >
          <span style={{ flex: 1, fontSize: '0.875rem', color: 'var(--text)' }}>Voeg Jobtide toe aan je beginscherm voor meldingen 📲</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
