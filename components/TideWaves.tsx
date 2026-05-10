'use client';

import { useEffect, useRef } from 'react';
import { motion, useSpring, useTransform, AnimatePresence } from 'framer-motion';

interface TideWavesProps {
  active: boolean;
  progress: number;
}

// Paths close with a tall rectangle so no corners are ever visible
const WAVE_PATHS = [
  'M0,45 C120,15 250,75 400,45 C550,15 680,75 800,45 C950,15 1080,75 1200,45 L1200,200 L0,200 Z',
  'M0,55 C100,30 230,80 400,55 C570,30 700,80 800,55 C970,30 1100,80 1200,55 L1200,200 L0,200 Z',
  'M0,62 C80,45 180,78 320,62 C460,45 560,78 720,62 C860,45 960,78 1200,62 L1200,200 L0,200 Z',
];

const LAYERS = [
  { opacity: 1.00, duration: 8,  reverse: false, color: '#6378ff' },
  { opacity: 0.75, duration: 5,  reverse: true,  color: '#818cf8' },
  { opacity: 0.55, duration: 3,  reverse: false, color: '#a78bfa' },
];

function WaveLayer({ path, opacity, duration, reverse, color }: {
  path: string; opacity: number; duration: number; reverse: boolean; color: string;
}) {
  const x = reverse ? ['0%', '50%'] : ['0%', '-50%'];
  return (
    <motion.div
      style={{ position: 'absolute', bottom: 0, left: '-5%', width: '210%', opacity, pointerEvents: 'none' }}
      animate={{ x }}
      transition={{ repeat: Infinity, duration, ease: 'linear' }}
    >
      <svg viewBox="0 0 1200 200" preserveAspectRatio="none"
        style={{ width: '100%', height: '100%', display: 'block' }} aria-hidden="true">
        <path d={path} fill={color} fillOpacity={0.9} />
      </svg>
    </motion.div>
  );
}

export default function TideWaves({ active, progress }: TideWavesProps) {
  const tideSpring = useSpring(0, { stiffness: 8, damping: 22, mass: 1.8 });
  const progressRef = useRef(progress);

  useEffect(() => {
    if (progressRef.current !== progress) {
      progressRef.current = progress;
      tideSpring.set(progress);
    }
  }, [progress, tideSpring]);

  const translateY = useTransform(tideSpring, [0, 100], ['10vh', '-2vh']);
  const height     = useTransform(tideSpring, [0, 100], ['22vh', '32vh']);

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
            bottom: 'var(--navbar-h)',
            left: '-5vw',
            right: '-5vw',
            translateY,
            height,
            pointerEvents: 'none',
            zIndex: 5,
          }}
        >
          {LAYERS.map((layer, i) => (
            <WaveLayer key={i} path={WAVE_PATHS[i]} opacity={layer.opacity}
              duration={layer.duration} reverse={layer.reverse} color={layer.color} />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
