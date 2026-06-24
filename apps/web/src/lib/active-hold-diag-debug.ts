'use client';

export type QueueDisplayDiagSnapshot = {
  hasNotificationShell: boolean;
  hasIncomingShell: boolean;
  hasResultShell: boolean;
  lobbyOpen: boolean;
  bootVisible: boolean;
  errorFallbackVisible: boolean;
  hasVisibleUserCardOverlay: boolean;
  activeKind: string | null;
  activeBanId: string | null;
  currentIncomingBanId: string | null;
  overlayQueueLen: number;
  pendingLen: number;
};

const defaultSnapshot: QueueDisplayDiagSnapshot = {
  hasNotificationShell: false,
  hasIncomingShell: false,
  hasResultShell: false,
  lobbyOpen: false,
  bootVisible: false,
  errorFallbackVisible: false,
  hasVisibleUserCardOverlay: false,
  activeKind: null,
  activeBanId: null,
  currentIncomingBanId: null,
  overlayQueueLen: 0,
  pendingLen: 0,
};

let snapshot: QueueDisplayDiagSnapshot = { ...defaultSnapshot };

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function patchQueueDisplayDiagSnapshot(
  patch: Partial<QueueDisplayDiagSnapshot>,
): void {
  snapshot = { ...snapshot, ...patch };
}

export function getQueueDisplayDiagSnapshot(): QueueDisplayDiagSnapshot {
  return { ...snapshot };
}

export function logActiveHoldSet(data: Record<string, unknown>): void {
  emit('[ACTIVE HOLD SET]', data);
}

export function logActiveHoldBlockDiag(data: Record<string, unknown>): void {
  emit('[ACTIVE HOLD BLOCK DIAG]', data);
}

export function logNoConnectionFallbackRendered(
  data: Record<string, unknown>,
): void {
  emit('[NO CONNECTION FALLBACK RENDERED]', data);
}

export function logQueueDisplayAttemptDiag(
  data: Record<string, unknown>,
): void {
  emit('[QUEUE DISPLAY ATTEMPT DIAG]', data);
}
