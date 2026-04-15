'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { usePushSubscription } from '@/lib/usePushSubscription';

export default function NotificationToggle() {
  const { permission, needsPrompt, iosNotInstalled, requestPermission } = usePushSubscription();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(permission === 'granted');
  }, [permission]);

  const handleToggle = async () => {
    if (enabled) {
      // Unsubscribe
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
          await fetch('/api/push-subscription', { method: 'DELETE' });
        }
      }
      setEnabled(false);
    } else {
      await requestPermission();
    }
  };

  if (iosNotInstalled) return null;
  if (!('PushManager' in (typeof window !== 'undefined' ? window : {}))) return null;

  const blocked = permission === 'denied';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="glass-card flex items-center justify-between gap-3 rounded-2xl px-4 py-3"
    >
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-semibold" style={{ color: 'var(--text)', margin: 0 }}>Pushmeldingen</p>
        <p className="text-xs" style={{ color: 'var(--text2)', margin: 0 }}>
          {blocked
            ? 'Geblokkeerd in browserinstellingen'
            : enabled
            ? 'Meldingen bij nieuwe vacatures'
            : 'Uitgeschakeld'}
        </p>
      </div>

      <button
        onClick={blocked ? undefined : handleToggle}
        disabled={blocked}
        aria-label="Pushmeldingen aan/uit"
        style={{
          width: 48,
          height: 28,
          borderRadius: 9999,
          background: enabled ? 'var(--accent)' : 'var(--border)',
          border: 'none',
          padding: 3,
          cursor: blocked ? 'not-allowed' : 'pointer',
          flexShrink: 0,
          position: 'relative',
          opacity: blocked ? 0.5 : 1,
          transition: 'background 200ms ease',
        }}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
          style={{
            display: 'block',
            width: 22,
            height: 22,
            borderRadius: 9999,
            background: '#fff',
            boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
            marginLeft: enabled ? 20 : 0,
          }}
        />
      </button>
    </motion.div>
  );
}
