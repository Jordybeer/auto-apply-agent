'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';

// Only show splash when running as installed PWA (standalone mode)
function isPwa(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true)
  );
}

// Smooth spring used for all enter transitions
const SPRING = { type: 'spring' as const, stiffness: 260, damping: 28 };
// Slow ease for the glow pulse
const GLOW_TRANSITION = { duration: 1.6, repeat: Infinity, repeatType: 'reverse' as const, ease: 'easeInOut' as const };

// Total visible duration before exit begins
const SPLASH_DURATION = 3200;
// Exit animation duration (ms) — must match framer exit transition below
const EXIT_DURATION = 800;

export default function SplashScreen() {
  const [show, setShow]       = useState(() => isPwa());
  const [exiting, setExiting] = useState(false);
  const reduced               = useReducedMotion();

  useEffect(() => {
    if (!show) return;
    // Start exit animation SPLASH_DURATION ms after mount
    const exitTimer = setTimeout(() => setExiting(true), SPLASH_DURATION);
    // Unmount after exit animation completes
    const hideTimer = setTimeout(() => setShow(false), SPLASH_DURATION + EXIT_DURATION);
    return () => { clearTimeout(exitTimer); clearTimeout(hideTimer); };
  }, [show]);

  if (!show) return null;

  return (
    <AnimatePresence>
      {!exiting && (
        <motion.div
          key="splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.04, filter: 'blur(8px)' }}
          transition={{ duration: EXIT_DURATION / 1000, ease: [0.4, 0, 0.2, 1] }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 'var(--z-splash)',
            background: '#0e1018',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            paddingTop:    'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)',
            overflow: 'hidden',
          }}
        >
          {/* ── Lottie background (skipped when reduced motion) ── */}
          {!reduced && (
            <motion.div
              initial={{ opacity: 0, scale: 1.08 }}
              animate={{ opacity: 0.45, scale: 1 }}
              transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
              style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
            >
              <DotLottieReact
                src="/lotties/data-bg.lottie"
                autoplay
                loop
                style={{ width: '100%', height: '100%' }}
              />
            </motion.div>
          )}

          {/* ── Radial glow behind icon ───────────────────────── */}
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: [0, 0.35, 0.22], scale: [0.6, 1.1, 1] }}
            transition={{ delay: 0.1, duration: 1.2, ease: [0.16, 1, 0.3, 1], times: [0, 0.4, 1] }}
            style={{
              position: 'absolute',
              width: 'clamp(180px, 70vw, 280px)',
              height: 'clamp(180px, 70vw, 280px)',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(129,140,248,0.45) 0%, transparent 70%)',
              pointerEvents: 'none',
            }}
          />

          {/* ── Icon + wordmark ───────────────────────────────── */}
          <motion.div
            style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}
          >
            {/* Icon box */}
            <motion.div
              initial={{ opacity: 0, y: reduced ? 0 : 24, scale: reduced ? 1 : 0.88, rotate: reduced ? 0 : -4 }}
              animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
              transition={reduced ? { duration: 0.4, delay: 0.1 } : { ...SPRING, delay: 0.3 }}
              style={{
                width: 'clamp(160px, 60vw, 264px)',
                height: 'clamp(160px, 60vw, 264px)',
                borderRadius: 'clamp(44px, 18vw, 72px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {/* Pulsing glow on the icon itself */}
              <motion.div
                animate={{ boxShadow: ['0 0 24px rgba(129,140,248,0.18)', '0 0 48px rgba(129,140,248,0.38)', '0 0 24px rgba(129,140,248,0.18)'] }}
                transition={GLOW_TRANSITION}
                style={{ borderRadius: 'clamp(34px, 16vw, 66px)', padding: 0, display: 'flex' }}
              >
                <img
                  src="/apple-icon.png"
                  alt="Jobtide icon"
                  style={{ width: 'clamp(100px, 38vw, 168px)', height: 'clamp(100px, 38vw, 168px)', borderRadius: 'clamp(26px, 10vw, 42px)', display: 'block' }}
                />
              </motion.div>
            </motion.div>

            {/* Wordmark — each letter group staggers in */}
            <motion.div
              style={{ display: 'flex', alignItems: 'baseline', gap: 0 }}
              initial="hidden"
              animate="visible"
              variants={{
                hidden: {},
                visible: { transition: { staggerChildren: reduced ? 0 : 0.045, delayChildren: reduced ? 0.3 : 0.4 } },
              }}
            >
              {'job'.split('').map((ch, i) => (
                <motion.span
                  key={`j${i}`}
                  variants={{
                    hidden: { opacity: 0, y: reduced ? 0 : 12, filter: reduced ? 'blur(0px)' : 'blur(4px)' },
                    visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
                  }}
                  style={{ fontSize: 'clamp(2rem, 9vw, 3.5rem)', fontWeight: 700, letterSpacing: '-0.03em', color: '#f0f2ff', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}
                >
                  {ch}
                </motion.span>
              ))}
              {'tide'.split('').map((ch, i) => (
                <motion.span
                  key={`t${i}`}
                  variants={{
                    hidden: { opacity: 0, y: reduced ? 0 : 12, filter: reduced ? 'blur(0px)' : 'blur(4px)' },
                    visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
                  }}
                  style={{ fontSize: 'clamp(2rem, 9vw, 3.5rem)', fontWeight: 700, letterSpacing: '-0.03em', color: '#818cf8', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}
                >
                  {ch}
                </motion.span>
              ))}
            </motion.div>

            {/* Tagline */}
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 0.45, y: 0 }}
              transition={{ delay: 1.1, duration: 0.6, ease: 'easeOut' }}
              style={{ fontSize: '0.75rem', color: '#a8b0d0', letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}
            >
              Vind een job die bij je past
            </motion.p>
          </motion.div>

          {/* ── Progress bar ──────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, scaleX: 0.8 }}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={{ delay: 0.8, duration: 0.5 }}
            style={{
              position: 'absolute',
              bottom: 'calc(env(safe-area-inset-bottom) + 2.75rem)',
              width: 'clamp(100px, 37vw, 140px)',
              height: 2,
              borderRadius: 9999,
              background: 'rgba(255,255,255,0.07)',
              overflow: 'hidden',
            }}
          >
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: '0%' }}
              transition={{ delay: 0.8, duration: SPLASH_DURATION / 1000 - 0.8, ease: [0.4, 0, 0.15, 1] }}
              style={{
                height: '100%',
                borderRadius: 9999,
                background: 'linear-gradient(90deg, #6366f1, #818cf8, #a78bfa)',
              }}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
