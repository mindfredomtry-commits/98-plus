import Script from 'next/script';
import { AppServicesProvider } from '@/app-services/AppServicesProvider';
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
      <Script id="build-marker-98" strategy="beforeInteractive">
        {`(function(){try{window.__buildMarker98="cta-crash-check-v1";}catch(e){}})();`}
      </Script>
      <Script id="lobby-orb-prehydrate-init" strategy="beforeInteractive">
        {`(function(){try{document.documentElement.style.setProperty('--boot-orb-initial-scale','0.15');}catch(e){}})();`}
      </Script>
      <AppServicesProvider>
        <AppHydrationMarker />
        {children}
      </AppServicesProvider>
      <DebugOverlay />
    </>
  );
}
