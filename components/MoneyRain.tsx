'use client';

import { useEffect, useRef, useState } from 'react';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';

type Props = {
  active?:   boolean;
  draining?: boolean;
  onDrained?: () => void;
};

export default function MoneyRain({ active = true, draining = false, onDrained }: Props) {
  const [opacity, setOpacity] = useState(active ? 1 : 0);
  const drainedRef = useRef(false);

  useEffect(() => {
    if (!active) {
      setOpacity(0);
      return;
    }
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
      className="pointer-events-none fixed inset-0"
      style={{
        zIndex: 0,
        opacity,
        transition: 'opacity 600ms ease',
      }}
    >
      {/* Tiled Lottie grid — 3×3 for full coverage */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gridTemplateRows: 'repeat(3, 1fr)',
          width: '100%',
          height: '100%',
          opacity: 0.18,
        }}
      >
        {Array.from({ length: 9 }).map((_, i) => (
          <DotLottieReact
            key={i}
            src="https://lottie.host/8a643be8-fad0-4f5f-9d40-bb9e3264e3f0/gFgRAkuXKY.lottie"
            loop
            autoplay
            style={{ width: '100%', height: '100%' }}
          />
        ))}
      </div>
    </div>
  );
}
