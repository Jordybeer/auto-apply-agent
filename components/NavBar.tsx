import Link from 'next/link';
import SettingsSheet from '@/components/SettingsSheet';
import ThemeToggle from '@/components/ThemeToggle';

export default function NavBar() {
  return (
    <nav
      className="w-full border-b px-6 py-3 flex items-center justify-between"
      style={{ background: 'var(--nav-bg)', borderColor: 'var(--nav-border)' }}
    >
      <Link href="/" className="font-semibold text-sm" style={{ color: 'var(--text)' }}>
        Job Agent
      </Link>
      <div className="flex items-center gap-2">
        <Link
          href="/"
          className="text-sm transition-colors px-3 py-1.5 rounded-lg"
          style={{ color: 'var(--text2)' }}
        >
          Vacatures
        </Link>
        <ThemeToggle />
        <SettingsSheet />
      </div>
    </nav>
  );
}
