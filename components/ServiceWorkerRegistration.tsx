'use client';

import { useEffect, useState } from 'react';

export default function ServiceWorkerRegistration() {
  const [updateReady, setUpdateReady] = useState(false);
  const [reg, setReg] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((r) => {
        setReg(r);

        // Already waiting on first load (e.g. hard refresh after deploy)
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

    // When the SW activates after SKIP_WAITING, reload to get fresh assets
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });
  }, []);

  const applyUpdate = () => {
    reg?.waiting?.postMessage('SKIP_WAITING');
  };

  if (!updateReady) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)',
        left: '50%',
        transform: 'translateX(-50%)',
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
      }}
    >
      <span style={{ flex: 1, fontSize: '0.875rem', color: 'var(--text)' }}>
        Nieuwe versie beschikbaar
      </span>
      <button
        onClick={applyUpdate}
        style={{
          background: 'var(--accent)',
          color: '#fff',
          border: 'none',
          borderRadius: '0.5rem',
          padding: '0.375rem 0.875rem',
          fontSize: '0.8125rem',
          fontWeight: 600,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        Herlaad
      </button>
    </div>
  );
}
