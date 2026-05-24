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
      <Providers>{children}</Providers>
    </>
  );
}
