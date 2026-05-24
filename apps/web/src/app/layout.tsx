import type { Metadata, Viewport } from 'next';
import './globals.css';
import { RuntimeConfigScript } from '@/components/RuntimeConfigScript';

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
  themeColor: '#0F0F0F',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <head>
        <RuntimeConfigScript />
      </head>
      <body className="bg-bg">{children}</body>
    </html>
  );
}
