'use client';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export type ZazhmiRenderSourceDiagInput = {
  file: string;
  component: string;
  source: string;
  phase: string;
  sendComposePhase: string | null;
  confirmActive: boolean;
  statusLabel: string | null;
  showLobbyOrb: boolean;
  lobbyOrbVisible: boolean;
  queueLen: number;
  pendingLen: number;
  overlayQueueLength: number;
  queueClaimsNotificationScreen: boolean;
};

/** Temporary render-path probe — no showLobbyOrb gate. */
export function traceZazhmiRenderSourceDiag(
  input: ZazhmiRenderSourceDiagInput,
): null {
  if (typeof window === 'undefined') return null;
  emit('[ZAZHMI RENDER SOURCE DIAG]', input);
  return null;
}
