import type { Metadata, Viewport } from 'next';
import './globals.css';
import NavBar from '@/components/NavBar';

export const metadata: Metadata = {
  title: 'werkzoeker',
  description: 'Vind een job die bij je past',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nl" className="h-full">
      <body className="antialiased h-full flex flex-col" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
        <NavBar />
        <div id="page-root" className="flex-1 overflow-y-auto">
          {children}
        </div>
      </body>
    </html>
  );
}
