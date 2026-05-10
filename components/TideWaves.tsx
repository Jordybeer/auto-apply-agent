'use client';

import { useEffect, useState } from 'react';
import { motion, useSpring, useTransform, AnimatePresence } from 'framer-motion';

interface TideWavesProps {
  active: boolean;
  progress: number;
}

const TILE_W = 800;
const TILES  = 4; // 4 tiles so reverse offset never runs out of content

function wavePath(yMid: number, amp: number): string {
  const b = 300;
  return [
    `M0,${yMid}`,
    `C100,${yMid - amp} 200,${yMid + amp} 400,${yMid}`,
    `C600,${yMid - amp} 700,${yMid + amp} 800,${yMid}`,
    `L800,${b} L0,${b} Z`,
  ].join(' ');
}

const BASE_PATH = wavePath(80,  55);
const MID_PATH  = wavePath(95,  45);
const TOP_PATH  = wavePath(108, 35);

// All layers scroll LEFT (same direction). "Reverse" layers start offset
// by one tile (25% of 4-tile container) so they appear to move differently.
// This eliminates the right-edge seam entirely.
const LAYERS = [
  { path: BASE_PATH, opacity: 0.45, duration: 9,  startX: '0%',    color: '#6378ff' },
  { path: MID_PATH,  opacity: 0.28, duration: 6,  startX: '-25%',  color: '#818cf8' },
  { path: TOP_PATH,  opacity: 0.18, duration: 4,  startX: '-12.5%',color: '#a78bfa' },
];

function WaveLayer({ path, opacity, duration, startX, color }: {
  path: string; opacity: number; duration: number; startX: string; color: string;
}) {
  // Shift left by exactly one tile (25% of 400% wide container) per loop cycle
  const from = startX;
  const to   = `calc(${startX} - 25%)`;

  return (
    <motion.div
      style={{
        position: 'absolute', bottom: 0, left: 0,
        width: `${TILES * 100}%`,
        height: '100%',
        opacity,
        pointerEvents: 'none',
      }}
      animate={{ x: [from, to] }}
      transition={{ repeat: Infinity, repeatType: 'loop', duration, ease: 'linear' }}
    >
      <svg
        viewBox={`0 0 ${TILE_W * TILES} 300`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: '100%', display: 'block' }}
        aria-hidden="true"
      >
        {Array.from({ length: TILES }, (_, i) => (
          <g key={i} transform={`translate(${TILE_W * i}, 0)`}>
            <path d={path} fill={color} fillOpacity={1} />
          </g>
        ))}
      </svg>
    </motion.div>
  );
}

export default function TideWaves({ active, progress }: TideWavesProps) {
  const [exiting, setExiting] = useState(false);
  const tideSpring = useSpring(progress, { stiffness: 7, damping: 24, mass: 2 });

  useEffect(() => {
    if (active) {
      setExiting(false);
      tideSpring.set(progress);
    }
  }, [progress, active, tideSpring]);

  useEffect(() => {
    if (!active) {
      setExiting(true);
      tideSpring.set(0);
    }
  }, [active, tideSpring]);

  const translateY = useTransform(tideSpring, [0, 100], ['100%', '0%']);
  const height     = useTransform(tideSpring, [0, 100], ['20vh', '30vh']);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (active) { setMounted(true); return; }
    const id = setTimeout(() => setMounted(false), 1800);
    return () => clearTimeout(id);
  }, [active]);

  return (
    <AnimatePresence>
      {mounted && (
        <motion.div
          key="tide-waves"
          initial={{ opacity: 0 }}
          animate={{ opacity: exiting ? 0 : 1 }}
          transition={{ duration: exiting ? 1.4 : 0.8, ease: 'easeInOut' }}
          style={{
            position: 'fixed',
            bottom: 'var(--navbar-h)',
            left: 0,
            right: 0,
            translateY,
            height,
            overflow: 'hidden',
            pointerEvents: 'none',
            zIndex: 5,
          }}
        >
          {LAYERS.map((layer, i) => (
            <WaveLayer key={i} path={layer.path} opacity={layer.opacity}
              duration={layer.duration} startX={layer.startX} color={layer.color} />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
