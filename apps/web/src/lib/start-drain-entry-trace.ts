export type StartDrainEntryTracePayload = {
  source: string;
  telegramUserId?: string | null;
  bansTab?: string | null;
  lobbyOpen?: boolean;
  showLobby?: boolean;
  activeKind?: string | null;
  activeBanId?: string | null;
  queueLen?: number;
  pendingLen?: number;
  queueHeadKind?: string | null;
  queueHeadBanId?: string | null;
  lobbyBansNeedAttention?: boolean;
  indicatorVisible?: boolean;
  notificationSessionActive?: boolean;
  notificationChainTransitioning?: boolean;
  notificationQueueUiLock?: boolean;
  queueClaimsNotificationScreen?: boolean;
  overlayQueueLength?: number;
  hasAnyOverlay?: boolean;
  hasIncomingOverlay?: boolean;
  hasResultOverlay?: boolean;
  hasNotificationOverlay?: boolean;
  effectiveBansOverlayOpen?: boolean;
  willCallStartDrain?: boolean;
  willStartDrain?: boolean | null;
  earlyReturnReason?: string | null;
  skipReason?: string | null;
};

export function logStartDrainEntryTrace(
  payload: StartDrainEntryTracePayload,
): void {
  console.log('START_DRAIN_ENTRY_TRACE', payload);
}
