'use client';

import { useEffect, useRef, useState } from 'react';
import Lottie from 'lottie-react';
import animationData from '@/public/lottie/rectangle.json';

type Props = {
  active?:    boolean;
  draining?:  boolean;
  onDrained?: () => void;
};

// NavBar height matches --navbar-h CSS token (56px + safe-area-inset-bottom)

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
        opacity: opacity * 0.06,
        transition: 'opacity 600ms ease',
        top: 'env(safe-area-inset-top, 0px)',
        left: 'env(safe-area-inset-left, 0px)',
        right: 'env(safe-area-inset-right, 0px)',
        bottom: 'var(--navbar-h)',
        filter: 'blur(1.5px)',
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
