'use client';

function emit(event: string, data: Record<string, unknown>): void {
  const timestamp = performance.now();
  const payload = { timestamp, t: timestamp, ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function logLobbyCtaVisibilityTrace(data: {
  showBanButton: boolean;
  canBan: boolean;
  energyReady: boolean;
  lowEnergy: boolean;
  activeOverlayKind: string | null;
  ownerActiveKind: string | null;
  queueLen: number;
  pendingLen: number;
  activeKind: string | null;
  shellKind: string | null;
  reason: string | null;
}): void {
  emit('LOBBY_CTA_VISIBILITY_TRACE', data);
}

export function logDrainEndStateTrace(data: {
  source: string;
  reason: string;
  queueLen: number;
  pendingLen: number;
  ownerActiveKind: string | null;
  ownerDisplayKind: string | null;
  activeOverlayKind: string | null;
  hasQueuedOverlayShell: boolean;
  notificationSessionActive: boolean;
  lobbyCtaVisible: boolean;
  drainCleared?: boolean;
}): void {
  emit('DRAIN_END_STATE_TRACE', data);
}

export function logGoToBansAfterDismissStateTrace(data: {
  banId: string;
  resultId: string;
  source: string;
  queueLen: number;
  pendingLen: number;
  activeKind: string | null;
  ownerActiveKind: string | null;
  ownerDisplayKind: string | null;
  nextHeadKind: string | null;
  lobbyCtaVisible: boolean;
}): void {
  emit('GO_TO_BANS_AFTER_DISMISS_STATE_TRACE', data);
}

export function logShowNextEmptyDrainTrace(data: {
  source: string;
  queueLen: number;
  pendingLen: number;
  activeKind: string | null;
  ownerActiveKind: string | null;
  ownerDisplayKind: string | null;
  expectedReturnToLobby: boolean;
  lobbyCtaVisible: boolean;
  branch: string;
}): void {
  emit('SHOW_NEXT_EMPTY_DRAIN_TRACE', data);
}
