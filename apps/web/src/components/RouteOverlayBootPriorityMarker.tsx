'use client';

import { useLayoutEffect } from 'react';
import { shouldBootYieldToRouteOverlay } from '@/lib/lobby-boot-route-priority';

type Props = {
  active: boolean;
};

/** Marks html[data-route-overlay-active] so boot layers sit under cards/overlays. */
export function RouteOverlayBootPriorityMarker({ active }: Props) {
  useLayoutEffect(() => {
    if (typeof document === 'undefined') return;
    if (active) {
      document.documentElement.dataset.routeOverlayActive = 'true';
    } else {
      delete document.documentElement.dataset.routeOverlayActive;
    }
  }, [active]);

  return null;
}

export { shouldBootYieldToRouteOverlay };
