'use client';

import { useEffect, useRef } from 'react';

const EMOJIS = [
  String.fromCodePoint(0x1F4B5), // 💵
  String.fromCodePoint(0x1F4B4), // 💴
  String.fromCodePoint(0x1F4B6), // 💶
  String.fromCodePoint(0x1F4B7), // 💷
  String.fromCodePoint(0x1F911), // 🤑
];
const COUNT = 22;

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
    size:     Math.random() * 14 + 22,   // was 18–32, now 22–36 (+20%)
    speed:    Math.random() * 0.8 + 0.4,
    drift:    (Math.random() - 0.5) * 0.5,
    rot:      Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.018,
    emoji:    EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
    alpha:    Math.random() * 0.20 + 0.30, // was 0.18–0.38, now 0.30–0.50
  };
}

type Props = {
  active?:   boolean;
  draining?: boolean;
  onDrained?: () => void;
};

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
          if (drainingRef.current) { bills.splice(i, 1); continue; }
          Object.assign(b, makeBill(true));
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
