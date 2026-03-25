'use client';

import { useEffect, useRef } from 'react';

const EMOJIS = ['\uD83D\uDCB5', '\uD83D\uDCB4', '\uD83D\uDCB6', '\uD83D\uDCB7', '\uD83E\uDD11'];
const COUNT  = 22;

type Bill = {
  x: number; y: number;
  size: number; speed: number;
  drift: number; rot: number; rotSpeed: number;
  emoji: string; alpha: number;
};

function makeBill(atTop: boolean): Bill {
  return {
    x:        Math.random() * window.innerWidth,
    y:        atTop ? -(Math.random() * 80 + 20) : Math.random() * window.innerHeight,
    size:     Math.random() * 14 + 16,
    speed:    Math.random() * 0.8 + 0.4,
    drift:    (Math.random() - 0.5) * 0.5,
    rot:      Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.018,
    emoji:    EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
    alpha:    Math.random() * 0.15 + 0.06,
  };
}

type Props = {
  /** true = spawning; false = stop spawning (used with draining) */
  active?: boolean;
  /** true = no new spawns, existing bills fall off then onDrained fires */
  draining?: boolean;
  /** called when last bill exits screen during drain */
  onDrained?: () => void;
};

/**
 * Drop props entirely for an always-looping ambient rain (e.g. login page).
 * Pass active/draining/onDrained for triggered mode (home page).
 */
export default function MoneyRain({ active = true, draining = false, onDrained }: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const activeRef   = useRef(active);
  const drainingRef = useRef(draining);
  const rafRef      = useRef<number>(0);

  useEffect(() => { activeRef.current   = active;   }, [active]);
  useEffect(() => { drainingRef.current = draining; }, [draining]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const bills: Bill[] = Array.from({ length: COUNT }, () => makeBill(false));
    let spawnTimer = 0;

    const tick = (ts: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (activeRef.current && !drainingRef.current) {
        if (ts - spawnTimer > 400) {
          spawnTimer = ts;
          if (bills.length < COUNT + 10) bills.push(makeBill(true));
        }
      }

      let i = bills.length;
      while (i--) {
        const b = bills[i];
        b.y   += b.speed;
        b.x   += b.drift;
        b.rot += b.rotSpeed;

        if (b.y > canvas.height + 80) {
          if (drainingRef.current) {
            bills.splice(i, 1);
            continue;
          }
          Object.assign(b, makeBill(true)); // loop
        }

        ctx.save();
        ctx.globalAlpha = b.alpha;
        ctx.font        = `${b.size}px serif`;
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        ctx.fillText(b.emoji, -b.size / 2, b.size / 2);
        ctx.restore();
      }

      if (drainingRef.current && bills.length === 0) {
        onDrained?.();
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: 0 }}
    />
  );
}
