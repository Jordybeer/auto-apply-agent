'use client';

import { useEffect } from 'react';
import { motion, useSpring, useTransform, AnimatePresence } from 'framer-motion';

interface TideWavesProps {
  active: boolean;
  progress: number;
}

// Paths start at x=-200 and end at x=1400 so the curve is always off-screen at both edges
// Bottom rectangle closes at y=300 — well past any visible area
const WAVE_PATHS = [
  'M-200,50 C0,20 200,80 400,50 C600,20 800,80 1000,50 C1200,20 1300,70 1400,50 L1400,300 L-200,300 Z',
  'M-200,60 C50,35 250,85 450,60 C650,35 850,85 1050,60 C1200,35 1350,75 1400,60 L1400,300 L-200,300 Z',
  'M-200,68 C100,50 300,82 500,68 C700,50 900,82 1100,68 C1250,50 1380,74 1400,68 L1400,300 L-200,300 Z',
];

const LAYERS = [
  { opacity: 0.55, duration: 9,  reverse: false, color: '#6378ff' },
  { opacity: 0.35, duration: 6,  reverse: true,  color: '#818cf8' },
  { opacity: 0.22, duration: 4,  reverse: false, color: '#a78bfa' },
];

function WaveLayer({ path, opacity, duration, reverse, color }: {
  path: string; opacity: number; duration: number; reverse: boolean; color: string;
}) {
  // Shift by exactly half the 1600-unit wide path so the repeat is seamless
  const x = reverse ? ['0%', '50%'] : ['0%', '-50%'];
  return (
    <motion.div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: '200%',   // double width for seamless loop
        height: '100%',
        opacity,
        pointerEvents: 'none',
      }}
      animate={{ x }}
      transition={{ repeat: Infinity, duration, ease: 'linear' }}
    >
      {/* viewBox matches the path coordinate space exactly */}
      <svg
        viewBox="0 0 1600 300"
        preserveAspectRatio="none"
        style={{ width: '100%', height: '100%', display: 'block' }}
        aria-hidden="true"
      >
        {/* Tile two copies side-by-side so the loop is truly seamless */}
        <path d={path} fill={color} fillOpacity={1} />
        <path d={path} fill={color} fillOpacity={1} transform="translate(800,0)" />
      </svg>
    </motion.div>
  );
}

export default function TideWaves({ active, progress }: TideWavesProps) {
  // Spring drives the rise; no ref guard needed — framer spring handles rapid updates fine
  const tideSpring = useSpring(0, { stiffness: 7, damping: 24, mass: 2 });

  useEffect(() => {
    tideSpring.set(progress);
  }, [progress, tideSpring]);

  // translateY: 100% = fully hidden below viewport edge, 0% = sitting at bottom
  const translateY = useTransform(tideSpring, [0, 100], ['100%', '0%']);
  const height     = useTransform(tideSpring, [0, 100], ['20vh', '30vh']);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="tide-waves"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 1.4, ease: 'easeInOut' } }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          style={{
            position: 'fixed',
            bottom: 'var(--navbar-h)',
            left: 0,
            right: 0,
            translateY,
            height,
            overflow: 'hidden',   // clips any sub-pixel edge artifacts
            pointerEvents: 'none',
            zIndex: 5,
          }}
        >
          {LAYERS.map((layer, i) => (
            <WaveLayer
              key={i}
              path={WAVE_PATHS[i]}
              opacity={layer.opacity}
              duration={layer.duration}
              reverse={layer.reverse}
              color={layer.color}
            />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
