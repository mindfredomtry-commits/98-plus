import type { Metadata, Viewport } from 'next';
import './open.css';

export const metadata: Metadata = {
  title: '98+ — Открыть в Telegram',
  description: 'Социальная система запретов. Открой 98+ в Telegram.',
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#050508',
};

export default function OpenLayout({ children }: { children: React.ReactNode }) {
  return children;
}
