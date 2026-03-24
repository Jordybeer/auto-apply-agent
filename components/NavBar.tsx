import Link from 'next/link';
import SettingsSheet from '@/components/SettingsSheet';

export default function NavBar() {
  return (
    <nav className="w-full border-b border-zinc-800 bg-zinc-950 px-6 py-3 flex items-center justify-between">
      <Link href="/" className="text-white font-semibold text-sm">
        Job Agent
      </Link>
      <div className="flex items-center gap-2">
        <Link href="/" className="text-zinc-400 hover:text-white text-sm transition-colors px-3 py-1.5 rounded-lg hover:bg-zinc-800">
          Vacatures
        </Link>
        <SettingsSheet />
      </div>
    </nav>
  );
}
