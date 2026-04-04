'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Download, Share, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type State = 'idle' | 'android' | 'ios';

const STORAGE_KEY = 'ja_pwa_dismissed';
const DELAY_MS    = 5000;

export default function PwaInstallToast() {
  const [state, setState]             = useState<State>('idle');
  const [deferredPrompt, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible]         = useState(false);
  const [iosExpanded, setIosExpanded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    try { if (localStorage.getItem(STORAGE_KEY)) return; } catch { /* ignore */ }

    const isIos    = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari = /safari/i.test(navigator.userAgent) && !/chrome|crios|fxios/i.test(navigator.userAgent);

    if (isIos && isSafari) {
      timerRef.current = setTimeout(() => { setState('ios'); setVisible(true); }, DELAY_MS);
      return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      timerRef.current = setTimeout(() => { setState('android'); setVisible(true); }, DELAY_MS);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const dismiss = () => {
    setVisible(false);
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* ignore */ }
  };

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setVisible(false);
    setDeferred(null);
  };

  return (
    <AnimatePresence>
      {state !== 'idle' && visible && (
        <motion.div
          key="pwa-toast"
          role="status"
          aria-live="polite"
          // Use Framer's x prop for the horizontal centering so it doesn't
          // conflict with the y/scale animation transforms.
          initial={{ opacity: 0, y: 24, scale: 0.97, x: '-50%' }}
          animate={{ opacity: 1, y: 0,  scale: 1,    x: '-50%' }}
          exit={{    opacity: 0, y: 16, scale: 0.97, x: '-50%', transition: { duration: 0.2 } }}
          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          style={{
            position:            'fixed',
            bottom:              'calc(var(--navbar-h) + 12px)',
            left:                '50%',
            width:               'min(calc(100vw - 32px), 420px)',
            zIndex:              110,
            background:          'var(--surface)',
            backdropFilter:      'saturate(220%) blur(56px)',
            WebkitBackdropFilter:'saturate(220%) blur(56px)',
            border:              '1px solid var(--border-bright)',
            boxShadow:           'var(--shadow-lg), 0 0 0 1px rgba(255,255,255,0.04) inset',
            borderRadius:        '1.125rem',
            padding:             '0.875rem 1rem',
          }}
        >
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <div style={{
              width: 36, height: 36, borderRadius: '0.625rem', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--accent-dim)',
              border:     '1px solid rgba(129,140,248,0.22)',
            }}>
              {state === 'ios'
                ? <Share size={16} style={{ color: 'var(--accent-bright)' }} strokeWidth={2} />
                : <Download size={16} style={{ color: 'var(--accent-bright)' }} strokeWidth={2} />
              }
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>
                Installeer als app
              </p>
              <p style={{ fontSize: '0.71875rem', color: 'var(--text2)', marginTop: 2, lineHeight: 1.35 }}>
                {state === 'ios'
                  ? 'Voeg toe aan beginscherm via Safari'
                  : 'Snelle toegang zonder browser'}
              </p>
            </div>

            <button
              onClick={dismiss}
              aria-label="Verberg"
              style={{
                width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--surface2)',
                border:     '1px solid var(--border)',
                color:      'var(--text3)',
                cursor:     'pointer',
              }}
            >
              <X size={13} strokeWidth={2.5} />
            </button>
          </div>

          {/* Android — single CTA */}
          {state === 'android' && (
            <motion.button
              onClick={install}
              whileTap={{ scale: 0.97 }}
              className="glass-btn-accent"
              style={{
                marginTop:    '0.625rem',
                width:        '100%',
                padding:      '0.5625rem 0',
                borderRadius: '0.75rem',
                fontSize:     '0.8125rem',
                fontWeight:   600,
                cursor:       'pointer',
              }}
            >
              Installeer app
            </motion.button>
          )}

          {/* iOS — expandable steps */}
          {state === 'ios' && (
            <>
              <motion.button
                onClick={() => setIosExpanded(v => !v)}
                whileTap={{ scale: 0.97 }}
                style={{
                  marginTop:      '0.625rem',
                  width:          '100%',
                  padding:        '0.5rem 0.75rem',
                  borderRadius:   '0.75rem',
                  fontSize:       '0.75rem',
                  fontWeight:     500,
                  cursor:         'pointer',
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'space-between',
                  background:     'var(--surface2)',
                  border:         '1px solid var(--border)',
                  color:          'var(--text2)',
                }}
              >
                <span>Hoe installeer ik?</span>
                <motion.span
                  animate={{ rotate: iosExpanded ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                  style={{ display: 'flex' }}
                >
                  <ChevronDown size={14} strokeWidth={2.5} />
                </motion.span>
              </motion.button>

              <AnimatePresence initial={false}>
                {iosExpanded && (
                  <motion.div
                    key="ios-steps"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div style={{
                      marginTop:     '0.5rem',
                      padding:       '0.625rem 0.75rem',
                      borderRadius:  '0.75rem',
                      background:    'var(--surface2)',
                      border:        '1px solid var(--border)',
                      display:       'flex',
                      flexDirection: 'column',
                      gap:           '0.5rem',
                    }}>
                      <IosStep n={1} text="Tik op het deel-icoon in Safari" />
                      <IosStep n={2} text='Kies "Zet op beginscherm"' />
                      <IosStep n={3} text='Tik op "Voeg toe"' />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function IosStep({ n, text }: { n: number; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.71875rem', color: 'var(--text2)' }}>
      <span style={{
        width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--accent-dim)',
        color:      'var(--accent-bright)',
        fontSize:   '0.625rem',
        fontWeight: 700,
      }}>{n}</span>
      {text}
    </div>
  );
}
