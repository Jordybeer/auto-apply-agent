import Link from 'next/link';
import type { ReactNode } from 'react';

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <main className="page-shell flex flex-col gap-5" style={{ position: 'relative', zIndex: 1 }}>
      <nav className="flex items-center gap-3 text-xs" style={{ color: 'var(--text2)' }}>
        <Link href="/settings" className="opacity-70 hover:opacity-100">← Instellingen</Link>
        <span className="opacity-30">/</span>
        <Link href="/legal/terms" className="opacity-70 hover:opacity-100">Voorwaarden</Link>
        <Link href="/legal/privacy" className="opacity-70 hover:opacity-100">Privacy</Link>
        <Link href="/legal/gdpr" className="opacity-70 hover:opacity-100">GDPR</Link>
      </nav>
      <article
        className="glass-card rounded-2xl p-5 flex flex-col gap-4 prose prose-sm max-w-none"
        style={{ color: 'var(--text)' }}
      >
        {children}
      </article>
    </main>
  );
}
