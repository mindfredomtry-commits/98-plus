'use client';

export type OverlayBackdropLayerTrace = {
  visualQueueDimSessionLive: boolean;
  backdropRendered: boolean;
  backdropClassName: string | null;
  hostMounted: boolean;
  cardContentMounted: boolean;
  zIndex: string | null;
  pointerEvents: string | null;
  opacity: string | null;
  decisionReason: string;
};

export function logOverlayBackdropLayerTrace(
  trace: OverlayBackdropLayerTrace,
): void {
  const payload = { timestamp: performance.now(), ...trace };
  console.log('OVERLAY_BACKDROP_LAYER_TRACE', payload);
  window.__debug98log?.('OVERLAY_BACKDROP_LAYER_TRACE', payload);
}
