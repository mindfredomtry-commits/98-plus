'use client';

import { useEffect, useRef } from 'react';
import {
  BOOT_ROUTE_FALLBACK_MS,
  isDeepLinkRouteBootPending,
  releaseDeepLinkRouteBoot,
} from '@/lib/deep-link-route-boot';
import { isCheckDeeplinkBootHoldActive } from '@/lib/check-deeplink-boot-hold';

type OverlayBootReleaseSignal = {
  incomingCardReady: boolean;
  incomingBanId: string | null;
  checkOverlayReady: boolean;
  checkBanId: string | null;
  resultOverlayReady: boolean;
  resultBanId: string | null;
  repeatReady: boolean;
  repeatBanId: string | null;
  activeBanReady: boolean;
  activeBanId: string | null;
};

/**
 * Boot overlay release: safety when overlay is ready + 1500ms fallback.
 * Does not touch notification queue, routing, or API.
 */
export function useBootRouteRelease(
  showBootScreen: boolean,
  deepLinkRouteBootPending: boolean,
  signals: OverlayBootReleaseSignal,
): void {
  const wasBootScreenRef = useRef(false);

  useEffect(() => {
    if (showBootScreen) {
      wasBootScreenRef.current = true;
      return;
    }
    if (wasBootScreenRef.current) {
      console.log('[boot-route-debug] showBootScreen false');
      wasBootScreenRef.current = false;
    }
  }, [showBootScreen]);

  useEffect(() => {
    if (!deepLinkRouteBootPending) return;
    const timer = window.setTimeout(() => {
      if (!isDeepLinkRouteBootPending()) return;
      if (isCheckDeeplinkBootHoldActive()) return;
      releaseDeepLinkRouteBoot('timeout-fallback');
    }, BOOT_ROUTE_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [deepLinkRouteBootPending]);

  const {
    incomingCardReady,
    incomingBanId,
    checkOverlayReady,
    checkBanId,
    resultOverlayReady,
    resultBanId,
    repeatReady,
    repeatBanId,
    activeBanReady,
    activeBanId,
  } = signals;

  useEffect(() => {
    if (!isDeepLinkRouteBootPending()) return;
    if (incomingCardReady && incomingBanId) {
      releaseDeepLinkRouteBoot('reply-card-ready', incomingBanId);
      return;
    }
    if (checkOverlayReady && checkBanId) {
      releaseDeepLinkRouteBoot('check-queued', checkBanId);
      return;
    }
    if (resultOverlayReady && resultBanId) {
      releaseDeepLinkRouteBoot('result-queued', resultBanId);
      return;
    }
    if (repeatReady && repeatBanId) {
      releaseDeepLinkRouteBoot('repeat-ready', repeatBanId);
      return;
    }
    if (activeBanReady && activeBanId) {
      releaseDeepLinkRouteBoot('active-ban-ready', activeBanId);
    }
  }, [
    incomingCardReady,
    incomingBanId,
    checkOverlayReady,
    checkBanId,
    resultOverlayReady,
    resultBanId,
    repeatReady,
    repeatBanId,
    activeBanReady,
    activeBanId,
  ]);
}
