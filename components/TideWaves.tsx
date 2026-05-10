'use client';

import { useEffect, useState } from 'react';
import { motion, useSpring, useTransform, AnimatePresence } from 'framer-motion';

interface TideWavesProps {
  active: boolean;
  progress: number;
}

// Each tile is exactly 800 units wide.
// 3 tiles = 2400 units. We animate x from 0 to -33.333% (one tile).
// Start frame == end frame → zero seam, zero reset flash.
const TILE_W = 800;
const TILES  = 3;

// Deeper amplitude (~55px swing in 300px tall viewBox)
function wavePath(yMid: number, amp: number): string {
  const b = 300; // bottom of viewBox
  return [
    `M0,${yMid}`,
    `C100,${yMid - amp} 200,${yMid + amp} 400,${yMid}`,
    `C600,${yMid - amp} 700,${yMid + amp} 800,${yMid}`,
    `L800,${b} L0,${b} Z`,
  ].join(' ');
}

const BASE_PATH = wavePath(80, 55);  // layer 1 — deepest
const MID_PATH  = wavePath(95, 45);  // layer 2
const TOP_PATH  = wavePath(108, 35); // layer 3 — shallowest / closest

const LAYERS = [
  { path: BASE_PATH, opacity: 0.45, duration: 9,  reverse: false, color: '#6378ff' },
  { path: MID_PATH,  opacity: 0.28, duration: 6,  reverse: true,  color: '#818cf8' },
  { path: TOP_PATH,  opacity: 0.18, duration: 4,  reverse: false, color: '#a78bfa' },
];

function buildTiledPath(path: string): string {
  // Repeat the single-tile path TILES times, offsetting x each time
  return Array.from({ length: TILES }, (_, i) => {
    if (i === 0) return path;
    // Replace all x-coordinates by adding TILE_W * i
    // Easier: just use SVG <use> via inline — but since we need a single <path>
    // we shift by parsing. Simpler: wrap in <g transform> per tile in JSX instead.
    return path; // handled via <g transform> in JSX below
  }).join(' ');
}

function WaveLayer({ path, opacity, duration, reverse, color }: {
  path: string; opacity: number; duration: number; reverse: boolean; color: string;
}) {
  // Animate exactly one tile width: -33.333% of the 300% wide container = one tile
  const from = '0%';
  const to   = reverse ? '33.333%' : '-33.333%';

  return (
    <motion.div
      style={{
        position: 'absolute', bottom: 0, left: 0,
        // 300% wide = 3 tiles fill the container, animation shifts by 1 tile
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
  // Track whether we're in exit so we can drive translateY back down
  const [exiting, setExiting] = useState(false);

  const tideSpring = useSpring(progress, { stiffness: 7, damping: 24, mass: 2 });

  useEffect(() => {
    if (active) {
      setExiting(false);
      tideSpring.set(progress);
    }
  }, [progress, active, tideSpring]);

  // On deactivate: drive spring back to 0 (wash down), then let AnimatePresence remove
  useEffect(() => {
    if (!active) {
      setExiting(true);
      tideSpring.set(0);
    }
  }, [active, tideSpring]);

  // 100% = below viewport, 0% = sitting at bottom
  const translateY = useTransform(tideSpring, [0, 100], ['100%', '0%']);
  const height     = useTransform(tideSpring, [0, 100], ['20vh', '30vh']);

  // Keep mounted during exit so the wash-down spring can play (~1.8s)
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (active) { setMounted(true); return; }
    // Unmount after spring has had time to settle back to 0
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
              duration={layer.duration} reverse={layer.reverse} color={layer.color} />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
