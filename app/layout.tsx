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
    <html lang="nl" data-theme="dark">
      <head>
        {/* Blocking script: read saved preference; fall back to dark (never system preference) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('ja_theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}else{document.documentElement.setAttribute('data-theme','dark');}}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`,
          }}
        />
      </head>
      <body className="antialiased">
        <NavBar />
        <div id="page-root">
          {children}
        </div>
      </body>
    </html>
  );
}
