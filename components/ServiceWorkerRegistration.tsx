'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        console.log('[SW] Registered, scope:', reg.scope);

        // Check for updates every 60s when the app is open
        setInterval(() => reg.update(), 60_000);
      })
      .catch((err) => console.warn('[SW] Registration failed:', err));
  }, []);

  return null;
}
