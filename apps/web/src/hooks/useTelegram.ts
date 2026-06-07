'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  readStartParamFromInitData,
} from '@98plus/shared';

export interface TgWebApp {
  initData: string;
  initDataUnsafe: {
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
      photo_url?: string;
    };
    start_param?: string;
    theme_params?: Record<string, string>;
  };
  ready: () => void;
  expand: () => void;
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  colorScheme?: 'light' | 'dark';
  themeParams?: Record<string, string>;
  platform?: string;
  BackButton?: {
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
  HapticFeedback?: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy') => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
  };
  openTelegramLink?: (url: string) => void;
}

declare global {
  interface Window {
    Telegram?: { WebApp: TgWebApp };
  }
}

function readStartParamFromUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const search = new URLSearchParams(window.location.search);
  const fromQuery =
    search.get('tgWebAppStartParam') ??
    search.get('startapp') ??
    search.get('start_param');
  if (fromQuery?.trim()) return fromQuery.trim();

  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return undefined;
  const hashParams = new URLSearchParams(hash);
  const fromHash =
    hashParams.get('tgWebAppStartParam') ??
    hashParams.get('startapp') ??
    hashParams.get('start_param');
  return fromHash?.trim() || undefined;
}

export function resolveTelegramStartParam(
  webApp: TgWebApp | null,
): string | undefined {
  const fromUnsafe = webApp?.initDataUnsafe?.start_param?.trim();
  if (fromUnsafe) return fromUnsafe;

  const fromInitData = readStartParamFromInitData(webApp?.initData)?.trim();
  if (fromInitData) return fromInitData;

  return readStartParamFromUrl();
}

export function useTelegram() {
  const [webApp, setWebApp] = useState<TgWebApp | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      tg.setHeaderColor('#050308');
      tg.setBackgroundColor('#050308');

      const tp = tg.themeParams ?? tg.initDataUnsafe?.theme_params;
      if (tp) {
        const root = document.documentElement;
        if (tp.bg_color) root.style.setProperty('--tg-bg', tp.bg_color);
        if (tp.text_color) root.style.setProperty('--tg-text', tp.text_color);
      }

      setWebApp(tg);
      if (tg.initData) {
        console.log('[auth-timing]', {
          event: 'initData-ready',
          hasInitData: true,
          telegramId: tg.initDataUnsafe?.user?.id ?? null,
          at: Date.now(),
        });
      }
    }
    setReady(true);
  }, []);

  const user = webApp?.initDataUnsafe?.user;
  const startParam = useMemo(
    () => resolveTelegramStartParam(webApp),
    [webApp],
  );

  const haptic = useCallback(
    (style: 'light' | 'medium' | 'heavy' = 'medium') => {
      webApp?.HapticFeedback?.impactOccurred(style);
    },
    [webApp],
  );

  const hapticSuccess = useCallback(() => {
    webApp?.HapticFeedback?.notificationOccurred('success');
  }, [webApp]);

  const bindBack = useCallback(
    (handler: () => void, visible: boolean) => {
      const bb = webApp?.BackButton;
      if (!bb) return () => {};
      if (visible) {
        bb.show();
        bb.onClick(handler);
      } else {
        bb.hide();
        bb.offClick(handler);
      }
      return () => {
        bb.offClick(handler);
        bb.hide();
      };
    },
    [webApp],
  );

  return {
    webApp,
    ready,
    initData: webApp?.initData ?? '',
    user,
    startParam,
    telegramId: user?.id,
    haptic,
    hapticSuccess,
    bindBack,
  };
}
