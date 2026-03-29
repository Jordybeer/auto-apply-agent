import Link from 'next/link';
import SettingsSheet from '@/components/SettingsSheet';
import ThemeToggle from '@/components/ThemeToggle';

export default function NavBar() {
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
            className="text-sm transition-colors px-3 py-1.5 rounded-lg"
            style={{ color: 'var(--text2)' }}
          >
            Insights
          </Link>
          <ThemeToggle />
          <SettingsSheet />
        </div>
      </div>
    </nav>
  );
}
