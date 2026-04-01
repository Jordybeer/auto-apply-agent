"use client";

// Renders data-bg.lottie as a full-page fixed background — homepage only.
// Uses @lottiefiles/dotlottie-react (supports .lottie binary format) with
// dynamic import so it never blocks SSR.
import dynamic from 'next/dynamic';

const DotLottieReact = dynamic(
  () => import('@lottiefiles/dotlottie-react').then((m) => m.DotLottieReact),
  { ssr: false }
);

export default function DatabgLottie({ theme }: { theme: 'dark' | 'light' }) {
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        mixBlendMode: theme === 'light' ? 'multiply' : 'screen',
        opacity: 0.18,
        filter: 'blur(2px)',
      }}
    >
      <DotLottieReact
        src="/lotties/data-bg.lottie"
        loop
        autoplay
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </div>
  );
}
