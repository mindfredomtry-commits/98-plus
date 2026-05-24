import type { Metadata } from 'next';
import './go.css';

export const metadata: Metadata = {
  title: '98+ — Открыть в Telegram',
  description: 'Тебе отправили запрет. Открой 98+ в Telegram.',
  robots: { index: true, follow: true },
};

export default function GoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
