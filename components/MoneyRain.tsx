'use client';

import { useEffect, useRef, useState } from 'react';
import Lottie from 'lottie-react';
import animationData from '@/public/lottie/rectangle.json';

type Props = {
  active?:    boolean;
  draining?:  boolean;
  onDrained?: () => void;
};

// NavBar is fixed at bottom, 58px tall + safe-area-inset-bottom
const NAV_HEIGHT = 58;

export default function MoneyRain({ active = true, draining = false, onDrained }: Props) {
  const [opacity, setOpacity] = useState(active ? 1 : 0);
  const drainedRef = useRef(false);

  useEffect(() => {
    if (!active) { setOpacity(0); return; }
    drainedRef.current = false;
    setOpacity(1);
  }, [active]);

  useEffect(() => {
    if (!draining || drainedRef.current) return;
    setOpacity(0);
    const t = setTimeout(() => {
      drainedRef.current = true;
      onDrained?.();
    }, 600);
    return () => clearTimeout(t);
  }, [draining, onDrained]);

  if (!active && opacity === 0) return null;

  return (
    <div
      className="pointer-events-none fixed"
      style={{
        zIndex: 0,
        opacity,
        transition: 'opacity 600ms ease',
        // stay inside safe areas and above the navbar
        top: 'env(safe-area-inset-top, 0px)',
        left: 'env(safe-area-inset-left, 0px)',
        right: 'env(safe-area-inset-right, 0px)',
        bottom: `calc(${NAV_HEIGHT}px + env(safe-area-inset-bottom, 0px))`,
      }}
    >
      <Lottie
        animationData={animationData}
        loop
        autoplay
        style={{ width: '100%', height: '100%' }}
        rendererSettings={{ preserveAspectRatio: 'none' }}
      />
    </div>
  );
}
