'use client';

import { useCallback, useEffect, useRef } from 'react';
import {
  bindTelegramOpenVisibilityGuard,
  GO_ANDROID_INTENT,
  GO_TG_DEEP_LINK,
  GO_WEB_FALLBACK,
  openTelegramFromGo,
  type GoTelegramAnchors,
} from '@/lib/open-telegram-from-go';

export default function GoLandingPage() {
  const tgAnchorRef = useRef<HTMLAnchorElement>(null);
  const webAnchorRef = useRef<HTMLAnchorElement>(null);
  const intentAnchorRef = useRef<HTMLAnchorElement>(null);

  const anchorsRef = useRef<GoTelegramAnchors>({
    tg: null,
    web: null,
    intent: null,
  });

  useEffect(() => {
    anchorsRef.current = {
      tg: tgAnchorRef.current,
      web: webAnchorRef.current,
      intent: intentAnchorRef.current,
    };
    return bindTelegramOpenVisibilityGuard();
  }, []);

  const handleOpen = useCallback(() => {
    anchorsRef.current = {
      tg: tgAnchorRef.current,
      web: webAnchorRef.current,
      intent: intentAnchorRef.current,
    };
    openTelegramFromGo(anchorsRef.current);
  }, []);

  return (
    <main className="go-landing">
      <a
        ref={tgAnchorRef}
        href={GO_TG_DEEP_LINK}
        className="go-landing__hidden-link"
        aria-hidden
        tabIndex={-1}
      />
      <a
        ref={webAnchorRef}
        href={GO_WEB_FALLBACK}
        className="go-landing__hidden-link"
        aria-hidden
        tabIndex={-1}
      />
      <a
        ref={intentAnchorRef}
        href={GO_ANDROID_INTENT}
        className="go-landing__hidden-link"
        aria-hidden
        tabIndex={-1}
      />
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
