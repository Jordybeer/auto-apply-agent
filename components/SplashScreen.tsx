'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';

export default function SplashScreen() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Show for 2.2s then fade out
    const t = setTimeout(() => setVisible(false), 2200);
    return () => clearTimeout(t);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.06 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: '#0e1018',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            paddingTop: 'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          {/* Lottie background animation */}
          <div style={{ position: 'absolute', inset: 0, opacity: 0.55, pointerEvents: 'none' }}>
            <DotLottieReact
              src="/lotties/data-bg.lottie"
              autoplay
              loop
              style={{ width: '100%', height: '100%' }}
            />
          </div>

          {/* Logo + wordmark */}
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.18, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.75rem',
            }}
          >
            {/* Icon mark */}
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: 20,
                background: 'linear-gradient(135deg, rgba(129,140,248,0.25) 0%, rgba(109,40,217,0.25) 100%)',
                border: '1px solid rgba(129,140,248,0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 0 40px rgba(129,140,248,0.2)',
              }}
            >
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                <path d="M10 26L18 10L26 26" stroke="#818cf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M13 21H23" stroke="#818cf8" strokeWidth="2.5" strokeLinecap="round"/>
                <circle cx="26" cy="12" r="3" fill="#a78bfa"/>
              </svg>
            </div>

            {/* Wordmark */}
            <span
              style={{
                fontSize: '1.5rem',
                fontWeight: 700,
                letterSpacing: '-0.03em',
                color: '#f0f2ff',
                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              }}
            >
              werk<span style={{ color: '#818cf8' }}>zoeker</span>
            </span>
          </motion.div>

          {/* Loading bar */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            style={{
              position: 'absolute',
              bottom: 'calc(env(safe-area-inset-bottom) + 2.5rem)',
              width: 120,
              height: 2,
              borderRadius: 9999,
              background: 'rgba(255,255,255,0.08)',
              overflow: 'hidden',
            }}
          >
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: '0%' }}
              transition={{ delay: 0.6, duration: 1.4, ease: 'easeInOut' }}
              style={{
                height: '100%',
                borderRadius: 9999,
                background: 'linear-gradient(90deg, #818cf8, #a78bfa)',
              }}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
