'use client';

import { useEffect, useRef, useState } from 'react';
import Lottie from 'lottie-react';
import animationData from '@/public/lottie/rectangle.json';

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
      style={{ zIndex: 0, opacity, transition: 'opacity 600ms ease' }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gridTemplateRows: 'repeat(3, 1fr)',
          width: '100%',
          height: '100%',
          opacity: 0.15,
        }}
      >
        {Array.from({ length: 9 }).map((_, i) => (
          <Lottie
            key={i}
            animationData={animationData}
            loop
            autoplay
            style={{ width: '100%', height: '100%' }}
          />
        ))}
      </div>
    </div>
  );
}
