import type { Metadata, Viewport } from 'next';
import './globals.css';
import NavBar from '@/components/NavBar';
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration';
import SplashScreen from '@/components/SplashScreen';
import PwaInstallToast from '@/components/PwaInstallToast';
import OnboardingWalkthrough from '@/components/OnboardingWalkthrough';

export const metadata: Metadata = {
  title: 'werkzoeker',
  description: 'Vind een job die bij je past',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'werkzoeker',
    startupImage: [
      { url: '/splash/iphone-se.png',             media: '(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2)' },
      { url: '/splash/iphone-8.png',              media: '(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)' },
      { url: '/splash/iphone-8-plus.png',         media: '(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3)' },
      { url: '/splash/iphone-12-14.png',          media: '(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)' },
      { url: '/splash/iphone-14-pro.png',         media: '(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)' },
      { url: '/splash/iphone-14-pro-max.png',     media: '(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)' },
      { url: '/splash/ipad-pro-11.png',           media: '(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2)' },
      { url: '/splash/ipad-pro-12-portrait.png',  media: '(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)' },
      { url: '/splash/ipad-pro-12-landscape.png', media: '(device-width: 1366px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2)' },
    ],
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,        // prevents iOS auto-zoom on input focus
  userScalable: false,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)',  color: '#0e1018' },
    { media: '(prefers-color-scheme: light)', color: '#eef0f7' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nl">
      <head>
        {/* Blocking script: saved preference → system preference → dark fallback */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('ja_theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}else{var sys=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';document.documentElement.setAttribute('data-theme',sys);}}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`,
          }}
        />
        {/* Apple touch icon — must have sizes attribute for iOS to pick it up */}
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
      </head>
      <body className="antialiased">
        <SplashScreen />
        <ServiceWorkerRegistration />
        <PwaInstallToast />
        <OnboardingWalkthrough />
        <NavBar />
        <div id="page-root">
          {children}
        </div>
      </body>
    </html>
  );
}
