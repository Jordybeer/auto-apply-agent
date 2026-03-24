'use client';

import { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('ja_theme');
    if (stored === 'light') {
      setLight(true);
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }, []);

  const toggle = () => {
    const next = !light;
    setLight(next);
    if (next) {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('ja_theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('ja_theme', 'dark');
    }
  };

  return (
    <button
      onClick={toggle}
      aria-label="Toggle light mode"
      className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
      style={{
        background: light ? 'rgba(99,102,241,0.12)' : 'transparent',
        color: light ? '#6366f1' : '#6b6b7b',
        fontSize: '1.1rem',
      }}
    >
      {light ? '💡' : '🌙'}
    </button>
  );
}
