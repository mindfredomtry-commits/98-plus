'use client';

import { useCallback } from 'react';

const BOT_DOMAIN =
  process.env.NEXT_PUBLIC_BOT_USERNAME?.replace('@', '') ??
  'Ninety_eight_pluss_Bot';

const TG_DEEP_LINK = `tg://resolve?domain=${BOT_DOMAIN}`;
const WEB_FALLBACK = `https://t.me/${BOT_DOMAIN}`;
const FALLBACK_DELAY_MS = 1200;

function openTelegramBot() {
  window.location.href = TG_DEEP_LINK;
  window.setTimeout(() => {
    if (document.visibilityState !== 'hidden') {
      window.location.href = WEB_FALLBACK;
    }
  }, FALLBACK_DELAY_MS);
}

export default function GoLandingPage() {
  const handleOpen = useCallback(() => {
    openTelegramBot();
  }, []);

  return (
    <main className="go-landing">
      <div className="go-landing__glow" aria-hidden />
      <div className="go-landing__inner">
        <p className="go-landing__logo">98+</p>
        <p className="go-landing__sub">Открой 98+ в Telegram</p>
        <button type="button" className="go-landing__cta" onClick={handleOpen}>
          🚫 Открыть в Telegram
        </button>
        <button type="button" className="go-landing__hint" onClick={handleOpen}>
          Если Telegram не открылся — нажми ещё раз
        </button>
      </div>
    </main>
  );
}
