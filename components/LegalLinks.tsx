import Link from 'next/link';

export default function LegalLinks({ className }: { className?: string }) {
  return (
    <nav
      className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs ${className ?? ''}`}
      style={{ color: 'var(--text2)' }}
      aria-label="Juridische links"
    >
      <Link href="/legal/terms" className="opacity-60 hover:opacity-100 transition-opacity">Voorwaarden</Link>
      <span className="opacity-30">·</span>
      <Link href="/legal/privacy" className="opacity-60 hover:opacity-100 transition-opacity">Privacy</Link>
      <span className="opacity-30">·</span>
      <Link href="/legal/gdpr" className="opacity-60 hover:opacity-100 transition-opacity">GDPR</Link>
      <span className="opacity-30">·</span>
      <a href="mailto:contact@jordy.beer" className="opacity-60 hover:opacity-100 transition-opacity">Contact</a>
    </nav>
  );
}
