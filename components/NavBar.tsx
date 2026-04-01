'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import SettingsSheet from '@/components/SettingsSheet';
import ThemeToggle from '@/components/ThemeToggle';

export default function NavBar() {
  const pathname = usePathname();

  if (pathname === '/login') return null;

  return (
    <nav
      className="w-full flex-shrink-0 border-b"
      style={{
        background: 'var(--nav-bg)',
        borderColor: 'var(--nav-border)',
        height: 'var(--navbar-h)',
        paddingTop:   'env(safe-area-inset-top, 0px)',
        paddingLeft:  'max(1.5rem, env(safe-area-inset-left))',
        paddingRight: 'max(1rem,   env(safe-area-inset-right))',
      }}
    >
      <div className="h-14 max-w-[640px] mx-auto flex items-center justify-between">
        <Link href="/" className="font-semibold text-sm" style={{ color: 'var(--text)' }}>
          Job Agent
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/insights"
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-all"
            style={{
              background: 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(167,139,250,0.18))',
              color: '#a78bfa',
              border: '1px solid rgba(167,139,250,0.35)',
            }}
          >
            <span style={{ fontSize: 13 }}>✨</span>
            Insights
          </Link>
          <ThemeToggle />
          <SettingsSheet />
        </div>
      </div>
    </nav>
  );
}
