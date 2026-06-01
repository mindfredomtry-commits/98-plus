'use client';

import { useEffect, useRef } from 'react';
import {
  instantBanDebug,
  isInstantBanLiteMode,
  logInstantBanViewport,
} from '@/lib/instant-ban-debug';

/** Stabilize InstantBanFlow height when mobile keyboard opens/closes. */
export function useInstantBanViewport(active: boolean): void {
  const countsRef = useRef({ resizeCount: 0, vvResizeCount: 0 });

  useEffect(() => {
    if (!active || typeof window === 'undefined') return;

    const root = document.documentElement;

    const applyHeight = (source: string) => {
      const vv = window.visualViewport;
      const h = vv?.height ?? window.innerHeight;
      root.style.setProperty('--instant-ban-vh', `${Math.round(h)}px`);
      if (process.env.NODE_ENV === 'development') {
        logInstantBanViewport(source, countsRef.current);
      }
    };

    const onWindowResize = () => {
      countsRef.current.resizeCount += 1;
      applyHeight('window.resize');
    };

    const onVvResize = () => {
      countsRef.current.vvResizeCount += 1;
      applyHeight('visualViewport.resize');
    };

    const onVvScroll = () => {
      applyHeight('visualViewport.scroll');
    };

    window.addEventListener('resize', onWindowResize);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', onVvResize);
    vv?.addEventListener('scroll', onVvScroll);

    const tg = window.Telegram?.WebApp as
      | { onEvent?: (event: string, cb: () => void) => void }
      | undefined;
    const onTgViewport = () => applyHeight('telegram.viewportChanged');
    tg?.onEvent?.('viewportChanged', onTgViewport);

    applyHeight('mount');

    return () => {
      window.removeEventListener('resize', onWindowResize);
      vv?.removeEventListener('resize', onVvResize);
      vv?.removeEventListener('scroll', onVvScroll);
      root.style.removeProperty('--instant-ban-vh');
    };
  }, [active]);

  useEffect(() => {
    if (!active || !isInstantBanLiteMode()) return;
    instantBanDebug('lite-mode', { enabled: true });
  }, [active]);
}
