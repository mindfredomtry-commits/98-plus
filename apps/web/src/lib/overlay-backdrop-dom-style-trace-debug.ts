'use client';

export type OverlayBackdropDomStyleTrace = {
  globalOverlayHostActive: boolean;
  backdropMounted: boolean;
  backdropActive: boolean;
  backdropClassName: string | null;
  backdropStyleOpacity: string | null;
  backdropComputedOpacity: string | null;
  backdropZIndex: string | null;
  hostZIndex: string | null;
  lobbyZIndex: string | null;
  cardMounted: boolean;
  visualQueueDimSessionLive: boolean;
  bridgeBackdropActive?: boolean;
  queueHeadKind: string | null;
  activeKind: string | null;
  reason: string;
};

export function logOverlayBackdropDomStyleTrace(
  trace: OverlayBackdropDomStyleTrace,
): void {
  const payload = { timestamp: performance.now(), ...trace };
  console.log('OVERLAY_BACKDROP_DOM_STYLE_TRACE', payload);
  window.__debug98log?.('OVERLAY_BACKDROP_DOM_STYLE_TRACE', payload);
}
