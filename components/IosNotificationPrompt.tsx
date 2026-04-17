'use client';

import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { usePushSubscription } from '@/lib/usePushSubscription';

const NOTIF_KEY = 'ja_notif_asked';

function isIosSafari() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) &&
    /safari/i.test(navigator.userAgent) &&
    !/chrome|crios|fxios/i.test(navigator.userAgent);
}

function isStandalone() {
  return ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true) ||
    window.matchMedia('(display-mode: standalone)').matches;
}

export default function IosNotificationPrompt() {
  const [visible, setVisible] = useState(false);
  const { requestPermission } = usePushSubscription();

  useEffect(() => {
    if (!isIosSafari()) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'default') return;
    if (localStorage.getItem(NOTIF_KEY)) return;

    if (isStandalone()) {
      setVisible(true);
      return;
    }

    const onDismissed = () => {
      if (typeof Notification === 'undefined' || Notification.permission !== 'default') return;
      if (localStorage.getItem(NOTIF_KEY)) return;
      setVisible(true);
    };

    window.addEventListener('pwa:dismissed', onDismissed);
    return () => window.removeEventListener('pwa:dismissed', onDismissed);
  }, []);

  const skip = () => {
    localStorage.setItem(NOTIF_KEY, '1');
    setVisible(false);
  };

  const enable = () => {
    localStorage.setItem(NOTIF_KEY, '1');
    setVisible(false);
    requestPermission();
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Meldingen inschakelen"
      style={{
        position:     'fixed',
        bottom:       0,
        left:         0,
        right:        0,
        zIndex:       'var(--z-onboarding-card)' as never,
        background:   'var(--surface)',
        opacity:      0.9,
        borderRadius: '24px 24px 0 0',
        border:       '1px solid var(--border-bright)',
        boxShadow:    '0 -24px 64px rgba(0,0,0,0.55)',
        paddingBottom:'calc(var(--navbar-h) + 8px)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 8 }}>
        <div style={{ width: 36, height: 4, borderRadius: 99, background: 'var(--border-bright)' }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '8px 20px 16px' }}>
        <div style={{
          width: 36, height: 36, borderRadius: '0.625rem', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--accent-dim)',
          border:     '1px solid rgba(129,140,248,0.22)',
        }}>
          <Bell size={16} style={{ color: 'var(--accent-bright)' }} strokeWidth={2} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>
            Meldingen inschakelen
          </p>
          <p style={{ fontSize: '0.71875rem', color: 'var(--text2)', marginTop: 2, lineHeight: 1.35 }}>
            Ontvang een melding als je pipeline klaar is
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '0 20px' }}>
        <button
          onClick={skip}
          style={{
            flex:         1,
            background:   'var(--surface2)',
            border:       '1px solid var(--border)',
            color:        'var(--text3)',
            borderRadius: '1rem',
            padding:      '0.7rem',
            fontWeight:   600,
            fontSize:     '0.8125rem',
            cursor:       'pointer',
          }}
        >
          Overslaan
        </button>
        <button
          onClick={enable}
          style={{
            flex:         2,
            background:   'var(--accent)',
            border:       'none',
            color:        '#fff',
            borderRadius: '1rem',
            padding:      '0.7rem',
            fontWeight:   700,
            fontSize:     '0.8125rem',
            cursor:       'pointer',
            boxShadow:    '0 4px 18px rgba(99,102,241,0.44)',
          }}
        >
          Inschakelen
        </button>
      </div>
    </div>
  );
}
