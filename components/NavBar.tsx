import Link from 'next/link';

export default function NavBar() {
  return (
    <nav className="w-full border-b border-zinc-800 bg-zinc-950 px-6 py-3 flex items-center justify-between">
      <Link href="/" className="text-white font-semibold text-sm">
        Test text please ignore
      </Link>
      <div className="flex items-center gap-4">
        <Link href="/" className="text-zinc-400 hover:text-white text-sm transition-colors">
          Vacatures
        </Link>
        <Link href="/settings" className="text-zinc-400 hover:text-white text-sm transition-colors">
          Instellingen
        </Link>
      </div>
    </nav>
  );
}