import Script from 'next/script';
import { Providers } from '@/components/Providers';
import { AppHydrationMarker } from '@/components/AppHydrationMarker';
import { DebugOverlay } from '@/components/DebugOverlay';

export default function MiniAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Script id="tg-lobby-shell-init" strategy="beforeInteractive">
        {`(function(){var t=window.Telegram&&window.Telegram.WebApp;if(!t)return;t.ready();t.expand();try{t.setHeaderColor("#050308");t.setBackgroundColor("#050308");}catch(e){}})();`}
      </Script>
      <Script id="lobby-orb-prehydrate-init" strategy="beforeInteractive">
        {`(function(){try{document.documentElement.style.setProperty('--boot-orb-initial-scale','0.15');}catch(e){}})();`}
      </Script>
      <Providers>
        <AppHydrationMarker />
        {children}
      </Providers>
      <DebugOverlay />
    </>
  );
}
