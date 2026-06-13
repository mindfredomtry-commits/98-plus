import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';
import { RuntimeConfigScript } from '@/components/RuntimeConfigScript';
import { LobbyOrbPrehydrateStyle } from '@/components/LobbyOrbPrehydrateStyle';

export const metadata: Metadata = {
  title: '98+',
  description: 'Социальная система запретов',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#050308',
};

const LOBBY_BOOT_EARLY_PAINT = `(function(){try{var d=document.documentElement,b=document.body,c="#0f0f0f";d.style.backgroundColor=c;if(b)b.style.backgroundColor=c;var t=window.Telegram&&window.Telegram.WebApp;if(t){t.ready();t.expand();try{t.setHeaderColor("#050308");t.setBackgroundColor("#050308");}catch(e){}}}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" style={{ backgroundColor: '#0f0f0f' }}>
      <head>
        <LobbyOrbPrehydrateStyle />
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
        <Script id="lobby-boot-early-paint" strategy="beforeInteractive">
          {LOBBY_BOOT_EARLY_PAINT}
        </Script>
        <RuntimeConfigScript />
      </head>
      <body className="bg-bg" style={{ margin: 0, backgroundColor: '#0f0f0f' }}>
        <div id="lobby-boot-shell-early" aria-hidden="true">
          <div id="lobby-boot-logo-prehydrate">98+</div>
        </div>
        {children}
      </body>
    </html>
  );
}
