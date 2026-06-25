'use client';

export type SuccessExitDebugSnapshot = {
  banId: string | null;
  queueLen: number;
  pendingLen: number;
  notificationSessionActive: boolean;
  hasPendingNotificationChain: boolean;
  latch: boolean;
  successExitDraining: boolean;
};

let snapshotReader: (() => SuccessExitDebugSnapshot) | null = null;
let instrumentationActive = false;
let successExitDrainingExtra = false;
let successExitInProgress = false;
let successExitAllowLobbyOpen = false;
let successCardSessionId = 0;
let authorizedDrainSessionId: number | null = null;
let lastSuccessExitDrainReason: string | null = null;
let lastSuccessExitDrainDetail: string | null = null;

export function beginSendSuccessCardSession(banId: string): number {
  if (successExitInProgress || successExitDrainingExtra) {
    emit('[SEND SUCCESS STALE EXIT LATCH CLEARED]', {
      banId,
      successExitInProgress,
      successExitDraining: successExitDrainingExtra,
    });
    endSuccessExitInProgress();
    successExitDrainingExtra = false;
  }
  authorizedDrainSessionId = null;
  successCardSessionId += 1;
  return successCardSessionId;
}

export function getSendSuccessCardSessionId(): number {
  return successCardSessionId;
}

export function authorizeSuccessExitDrain(sessionId: number): boolean {
  if (sessionId !== successCardSessionId) {
    emit('[SUCCESS EXIT RETRY BLOCKED BEFORE CARD]', {
      reason: 'stale-session',
      sessionId,
      activeSessionId: successCardSessionId,
    });
    return false;
  }
  authorizedDrainSessionId = sessionId;
  return true;
}

export function canDrainNotificationAfterSuccess(): boolean {
  return (
    authorizedDrainSessionId !== null &&
    authorizedDrainSessionId === successCardSessionId
  );
}

export function clearStaleSuccessExitLatch(source: string): void {
  if (successExitInProgress || successExitDrainingExtra) {
    emit('[SEND SUCCESS STALE EXIT LATCH CLEARED]', {
      source,
      successExitInProgress,
      successExitDraining: successExitDrainingExtra,
    });
    endSuccessExitInProgress();
    successExitDrainingExtra = false;
  }
  authorizedDrainSessionId = null;
}

export function logSendSuccessCardShowRequired(data: {
  banId: string;
  sessionId: number;
}): void {
  emit('[SEND SUCCESS CARD SHOW REQUIRED]', data);
}

export function logSuccessCardMountedDebug(data: {
  banId: string | null;
  source?: string | null;
  sessionId?: number;
}): void {
  emit('[SUCCESS CARD MOUNTED]', data);
}

export function logSuccessExitRetryBlockedBeforeCard(
  data: Record<string, unknown>,
): void {
  emit('[SUCCESS EXIT RETRY BLOCKED BEFORE CARD]', data);
}

export function logSuccessDrainOnlyAfterExit(data: Record<string, unknown>): void {
  emit('[SUCCESS DRAIN ONLY AFTER EXIT]', data);
}

export function logSuccessCardSkippedBug(data: Record<string, unknown>): void {
  emit('[SUCCESS CARD SKIPPED BUG]', data);
}

export function registerSuccessExitDebugSnapshot(
  reader: (() => SuccessExitDebugSnapshot) | null,
): void {
  snapshotReader = reader;
}

export function setSuccessExitDrainingForDebug(active: boolean): void {
  successExitDrainingExtra = active;
}

export function beginSuccessExitInProgress(): void {
  successExitInProgress = true;
  successExitAllowLobbyOpen = false;
}

export function allowSuccessExitLobbyOpen(): void {
  successExitAllowLobbyOpen = true;
}

export function endSuccessExitInProgress(): void {
  successExitInProgress = false;
  successExitAllowLobbyOpen = false;
}

/** Blocks visual lobby open during success-exit until drain finishes (or explicit allow). */
export function shouldSuppressLobbyOpenDuringSuccessExit(): boolean {
  return successExitInProgress && !successExitAllowLobbyOpen;
}

export function readSuccessExitDebugSnapshot(): SuccessExitDebugSnapshot {
  const base =
    snapshotReader?.() ?? {
      banId: null,
      queueLen: 0,
      pendingLen: 0,
      notificationSessionActive: false,
      hasPendingNotificationChain: false,
      latch: false,
      successExitDraining: false,
    };
  return {
    ...base,
    successExitDraining: successExitDrainingExtra,
  };
}

export function beginSuccessExitInstrumentation(): void {
  instrumentationActive = true;
}

export function endSuccessExitInstrumentation(): void {
  instrumentationActive = false;
}

export function isSuccessExitInstrumentationActive(): boolean {
  return instrumentationActive;
}

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function logSuccessExitClick(
  extra?: Partial<SuccessExitDebugSnapshot>,
): void {
  beginSuccessExitInstrumentation();
  emit('[SUCCESS EXIT CLICK]', {
    ...readSuccessExitDebugSnapshot(),
    ...extra,
  });
}

export function logSuccessExitStart(data: {
  phase: 'handle-success-exit-complete' | 'commit-send-success-exit';
  lobbySource?: string;
}): void {
  emit('[SUCCESS EXIT START]', {
    ...readSuccessExitDebugSnapshot(),
    ...data,
  });
}

export function logSuccessExitLobbyOpenAttempt(data: {
  source: string;
  via: 'openLobby' | 'setLobbyOpen(true)' | 'beginCtaSpringIn';
  blocked?: string | null;
}): void {
  if (!instrumentationActive) return;
  emit('[SUCCESS EXIT LOBBY OPEN ATTEMPT]', {
    ...readSuccessExitDebugSnapshot(),
    ...data,
  });
}

export function logSuccessExitDrainStart(): void {
  lastSuccessExitDrainReason = null;
  lastSuccessExitDrainDetail = null;
  emit('[SUCCESS EXIT DRAIN START]', {
    ...readSuccessExitDebugSnapshot(),
  });
}

export function recordSuccessExitDrainFailure(
  reason: string,
  detail?: string,
): void {
  lastSuccessExitDrainReason = reason;
  lastSuccessExitDrainDetail = detail ?? null;
}

export function readLastSuccessExitDrainDiagnostic(): {
  drainedReasonRaw: string | null;
  drainedReasonDetail: string | null;
  drainedReason: string;
} {
  return {
    drainedReasonRaw: lastSuccessExitDrainReason,
    drainedReasonDetail: lastSuccessExitDrainDetail,
    drainedReason: formatSuccessExitDrainedReasonLabel(
      lastSuccessExitDrainReason,
    ),
  };
}

export function formatSuccessExitDrainedReasonLabel(
  raw: string | null | undefined,
): string {
  const reason = raw ?? '';
  if (reason === 'show-next-blocked' || reason === 'drain-not-shown') {
    return 'showNextNotificationFromChainSync returned blocked';
  }
  if (
    reason === 'continue-blocked' ||
    reason.startsWith('continue-outcome-')
  ) {
    return 'continueNotificationChainOrOpenLobby returned false';
  }
  if (
    reason === 'success-exit-empty-no-retry' ||
    reason === 'queue-empty-after-prefetch'
  ) {
    return 'no queue head selected';
  }
  if (
    reason === 'try-drain-overlay-blocked' ||
    reason === 'overlay-blocked'
  ) {
    return 'tryDrain aborted';
  }
  if (
    reason === 'compose-active' ||
    reason === 'success-card-still-mounted' ||
    reason === 'success-exit-retry-blocked-empty' ||
    reason === 'success-exit-not-authorized'
  ) {
    return 'stale handoff / active lock / transition guard';
  }
  if (reason.length === 0) {
    return 'unknown';
  }
  return 'unknown';
}

export function logSuccessExitDrainResult(data: {
  drained: boolean;
  queueLenAfter: number;
  pendingLenAfter: number;
  selectedKind?: string | null;
  selectedBanId?: string | null;
  reason?: string;
}): void {
  if (!data.drained) {
    lastSuccessExitDrainReason = data.reason ?? 'unknown';
    lastSuccessExitDrainDetail = null;
  }
  emit('[SUCCESS EXIT DRAIN RESULT]', data);
}

export function logFirstNotificationSelected(data: {
  kind: string | null;
  banId: string | null;
  source: string;
}): void {
  emit('[FIRST NOTIFICATION SELECTED]', data);
}

export function logFirstNotificationMounted(data: {
  kind: string;
  banId: string;
}): void {
  emit('[FIRST NOTIFICATION MOUNTED]', data);
  endSuccessExitInstrumentation();
}

export function logSuccessExitEmptyQueueClearOverlay(data: {
  source: string;
  queueLen: number;
  startupLen: number;
}): void {
  emit('[SUCCESS EXIT EMPTY QUEUE CLEAR OVERLAY]', data);
}

export function logEmptyOverlayHostBlocked(data: Record<string, unknown>): void {
  emit('[EMPTY OVERLAY HOST BLOCKED]', data);
}

export function logSuccessExitTimerCardTopOk(data: Record<string, unknown>): void {
  emit('[SUCCESS EXIT TIMER CARD TOP OK]', data);
}

export function logEmptyBackdropBug(data: Record<string, unknown>): void {
  emit('[EMPTY BACKDROP BUG]', data);
}
