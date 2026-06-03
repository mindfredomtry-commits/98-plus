import Script from 'next/script';
import { Providers } from '@/components/Providers';

export default function MiniAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="beforeInteractive"
      />
      <Script id="tg-lobby-shell-init" strategy="beforeInteractive">
        {`(function(){var t=window.Telegram&&window.Telegram.WebApp;if(!t)return;t.ready();t.expand();try{t.setHeaderColor("#050308");t.setBackgroundColor("#050308");}catch(e){}})();`}
      </Script>
      <Providers>{children}</Providers>
    </>
  );
}
