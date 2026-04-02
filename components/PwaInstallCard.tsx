'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Share, X } from 'lucide-react';

type InstallState = 'loading' | 'installed' | 'ios-prompt' | 'android-prompt' | 'unsupported';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PwaInstallCard() {
  const [state, setState]     = useState<InstallState>('loading');
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setState('installed');
      return;
    }

    // iOS Safari
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari = /safari/i.test(navigator.userAgent) && !/chrome|crios|fxios/i.test(navigator.userAgent);
    if (isIos && isSafari) {
      setState('ios-prompt');
      return;
    }

    // Android / Chrome — listen for beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setState('android-prompt');
    };
    window.addEventListener('beforeinstallprompt', handler);

    // If event already fired before we listened (rare)
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleAndroidInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') setState('installed');
    setDeferredPrompt(null);
  };

  if (dismissed) return null;

  return (
    <AnimatePresence>
      {state !== 'loading' && (
        <motion.div
          key="pwa-card"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="glass-card rounded-2xl p-4 flex flex-col gap-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--accent-dim)', border: '1px solid rgba(129,140,248,0.25)' }}
              >
                {state === 'installed'
                  ? <span style={{ fontSize: 16 }}>✓</span>
                  : <Download size={16} style={{ color: 'var(--accent-bright)' }} strokeWidth={2} />}
              </div>
              <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                {state === 'installed' ? 'App geïnstalleerd' : 'Installeer als app'}
              </span>
            </div>
            {state !== 'installed' && (
              <button
                onClick={() => setDismissed(true)}
                className="w-6 h-6 flex items-center justify-center rounded-full"
                style={{ color: 'var(--text3)', background: 'var(--surface2)' }}
                aria-label="Verberg"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {state === 'installed' && (
            <p className="text-xs" style={{ color: 'var(--text2)' }}>
              werkzoeker draait als standalone app op dit apparaat.
            </p>
          )}

          {state === 'ios-prompt' && (
            <>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text2)' }}>
                Voeg werkzoeker toe aan je beginscherm voor de beste ervaring.
              </p>
              <div className="glass-inset rounded-xl px-3 py-2.5 flex flex-col gap-2">
                <Step n={1} icon={<Share size={13} />} text="Tik op het deel-icoon in Safari" />
                <Step n={2} icon={<span style={{ fontSize: 12 }}>⊕</span>} text='Kies "Zet op beginscherm"' />
                <Step n={3} icon={<span style={{ fontSize: 12 }}>✓</span>} text='Tik op "Voeg toe"' />
              </div>
            </>
          )}

          {state === 'android-prompt' && (
            <>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text2)' }}>
                Installeer werkzoeker als app voor snelle toegang zonder browser.
              </p>
              <motion.button
                onClick={handleAndroidInstall}
                whileTap={{ scale: 0.96 }}
                className="glass-btn-accent w-full py-2.5 rounded-xl text-sm font-semibold"
              >
                Installeer app
              </motion.button>
            </>
          )}

          {state === 'unsupported' && (
            <p className="text-xs" style={{ color: 'var(--text3)' }}>
              PWA installatie wordt niet ondersteund door deze browser.
            </p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Step({ n, icon, text }: { n: number; icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2.5 text-xs" style={{ color: 'var(--text2)' }}>
      <span
        className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
        style={{ background: 'var(--accent-dim)', color: 'var(--accent-bright)', fontSize: 9 }}
      >{n}</span>
      <span className="flex items-center gap-1">{icon} {text}</span>
    </div>
  );
}
