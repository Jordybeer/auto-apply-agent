'use client';

import { useEffect } from 'react';
import { motion, useSpring, useTransform, AnimatePresence } from 'framer-motion';

interface TideWavesProps {
  active: boolean;
  progress: number;
}

const WAVE_PATHS = [
  'M0,45 C120,15 250,75 400,45 C550,15 680,75 800,45 C950,15 1080,75 1200,45 L1200,120 L0,120 Z',
  'M0,55 C100,30 230,80 400,55 C570,30 700,80 800,55 C970,30 1100,80 1200,55 L1200,120 L0,120 Z',
  'M0,62 C80,45 180,78 320,62 C460,45 560,78 720,62 C860,45 960,78 1200,62 L1200,120 L0,120 Z',
];

// Higher base opacity — dark navy bg swallows subtle colors
const LAYERS = [
  { opacity: 0.70, duration: 8,  reverse: false, color: 'rgba(99,120,255,0.90)'  },
  { opacity: 0.50, duration: 5,  reverse: true,  color: 'rgba(129,140,248,0.80)' },
  { opacity: 0.35, duration: 3,  reverse: false, color: 'rgba(167,139,250,0.70)' },
];

function WaveLayer({
  path, opacity, duration, reverse, color,
}: {
  path: string;
  opacity: number;
  duration: number;
  reverse: boolean;
  color: string;
}) {
  const x = reverse ? ['0%', '50%'] : ['0%', '-50%'];
  return (
    <motion.div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: '200%',
        opacity,
        pointerEvents: 'none',
      }}
      animate={{ x }}
      transition={{ repeat: Infinity, duration, ease: 'linear' }}
    >
      <svg
        viewBox="0 0 1200 120"
        preserveAspectRatio="none"
        style={{ width: '100%', height: '100%', display: 'block' }}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`wg-${duration}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={color} stopOpacity="1" />
            <stop offset="100%" stopColor={color} stopOpacity="0.15" />
          </linearGradient>
        </defs>
        <path d={path} fill={`url(#wg-${duration})`} />
      </svg>
    </motion.div>
  );
}

export default function TideWaves({ active, progress }: TideWavesProps) {
  const tideSpring = useSpring(progress, { stiffness: 12, damping: 16, mass: 1.2 });
  useEffect(() => { tideSpring.set(progress); }, [progress, tideSpring]);

  const translateY = useTransform(tideSpring, [0, 100], ['15vh', '0vh']);
  const height     = useTransform(tideSpring, [0, 100], ['20vh', '30vh']);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="tide-waves"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 1.2, ease: 'easeInOut' } }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            translateY,
            height,
            pointerEvents: 'none,
            // Must sit above body::before/::after orbs (z:0) and page-root isolation context
            zIndex: 10,
            overflow: 'hidden',
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
