"use client";

// Renders data-bg.lottie as a full-page fixed background.
// Uses @dotlottie/react (already in most lottie setups) with a dynamic
// import so it never blocks SSR. Opacity is 0.18. The mix-blend-mode
// switches between 'screen' (dark) and 'multiply' (light) so the
// animation stays visible but respectful in both themes.
import dynamic from 'next/dynamic';

const DotLottieReact = dynamic(
  () => import('@dotlottie/react').then((m) => m.DotLottieReact),
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
        // blend-mode keeps the animation readable on both themes
        mixBlendMode: theme === 'light' ? 'multiply' : 'screen',
        opacity: 0.18,
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
