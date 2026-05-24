import type { Metadata, Viewport } from 'next';
import './open.css';

export const metadata: Metadata = {
  title: '98+ — Запрети в ответ',
  description: 'TikTok запретил Telegram. Запрети в ответ. Социальная система запретов.',
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
