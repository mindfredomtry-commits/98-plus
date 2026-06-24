'use client';

export type PostSuccessHandoffSelectedNext = {
  kind: string;
  banId: string | null;
};

let handoffInProgress = false;
let earlyArmDone = false;
let successExitWindowOpen = false;
let selectedNext: PostSuccessHandoffSelectedNext | null = null;
let handoffTraceId = 0;
let emptyFinalizedTraceId: number | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function subscribePostSuccessHandoff(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPostSuccessHandoffSnapshot(): boolean {
  return handoffInProgress;
}

export function isPostSuccessHandoffInProgress(): boolean {
  return handoffInProgress;
}

export function getPostSuccessHandoffSelectedNext(): PostSuccessHandoffSelectedNext | null {
  return selectedNext;
}

export function getPostSuccessHandoffTraceId(): number {
  return handoffTraceId;
}

export type SuccessExitChainEmptySnapshot = {
  queueLen: number;
  pendingLen: number;
  incomingLen: number;
  checkLen: number;
  resultLen: number;
  bufferedIncomingId?: string | null;
  heldNextKind?: string | null;
  finalQueueLen?: number;
  finalPendingLen?: number;
};

export function isSuccessExitChainFullyEmpty(
  collected: SuccessExitChainEmptySnapshot,
): boolean {
  return (
    collected.queueLen === 0 &&
    collected.pendingLen === 0 &&
    collected.incomingLen === 0 &&
    collected.checkLen === 0 &&
    collected.resultLen === 0 &&
    (collected.bufferedIncomingId ?? null) == null &&
    (collected.heldNextKind ?? null) == null &&
    (collected.finalQueueLen ?? 0) === 0 &&
    (collected.finalPendingLen ?? 0) === 0
  );
}

export function finalizePostSuccessHandoffEmptyNoRetry(
  data: Record<string, unknown>,
): void {
  emptyFinalizedTraceId = handoffTraceId;
  emit('[POST SUCCESS EMPTY FINALIZED]', {
    traceId: handoffTraceId,
    reason: 'success-exit-empty-no-retry',
    ...data,
  });
  completePostSuccessHandoffEmptyOpenLobby({
    reason: 'success-exit-empty-no-retry',
    traceId: handoffTraceId,
    ...data,
  });
}

export function shouldBlockPostSuccessEmptyRetry(source: string): boolean {
  if (emptyFinalizedTraceId == null) return false;
  if (emptyFinalizedTraceId !== handoffTraceId) return false;
  if (
    !source.includes('success-exit-retry') &&
    !source.includes('success-exit-retry-flush')
  ) {
    return false;
  }
  emit('[POST SUCCESS RETRY BLOCKED EMPTY]', {
    source,
    traceId: handoffTraceId,
    reason: 'primary-success-exit-empty-finalized',
  });
  return true;
}

export function shouldBlockPostSuccessPrefetchAfterEmpty(source: string): boolean {
  if (emptyFinalizedTraceId == null) return false;
  if (emptyFinalizedTraceId !== handoffTraceId) return false;
  if (!source.includes('success-exit')) return false;
  emit('[POST SUCCESS RETRY BLOCKED EMPTY]', {
    source,
    traceId: handoffTraceId,
    reason: 'primary-success-exit-empty-finalized',
  });
  return true;
}

export function markPostSuccessExitWindowOpen(
  data?: Record<string, unknown>,
): void {
  successExitWindowOpen = true;
  if (data) {
    emit('[POST SUCCESS EXIT WINDOW OPEN]', data);
  }
}

export function clearPostSuccessExitWindow(): void {
  successExitWindowOpen = false;
  earlyArmDone = false;
}

export function isPostSuccessExitWindowOpen(): boolean {
  return successExitWindowOpen;
}

export function armPostSuccessHandoffEarly(
  data: Record<string, unknown>,
): boolean {
  const queueLen = Number(data.queueLen ?? 0);
  const pendingLen = Number(data.pendingLen ?? 0);
  const hasPendingChain = data.hasPendingChain === true;
  const hasQueue = queueLen > 0 || pendingLen > 0 || hasPendingChain;
  if (!hasQueue) return false;
  emptyFinalizedTraceId = null;
  handoffInProgress = true;
  earlyArmDone = true;
  selectedNext = null;
  emit('[POST SUCCESS HANDOFF EARLY ARM]', data);
  notify();
  return true;
}

export function beginPostSuccessHandoff(data: Record<string, unknown>): void {
  if (handoffInProgress) {
    const source = String(data.source ?? '');
    if (source.includes('success-exit')) {
      emptyFinalizedTraceId = null;
    }
    emit('[POST SUCCESS HANDOFF START]', {
      ...data,
      alreadyArmedEarly: earlyArmDone,
      traceId: handoffTraceId,
    });
    return;
  }
  handoffTraceId += 1;
  emptyFinalizedTraceId = null;
  handoffInProgress = true;
  earlyArmDone = false;
  selectedNext = null;
  emit('[POST SUCCESS HANDOFF START]', { traceId: handoffTraceId, ...data });
  notify();
}

export function logPostSuccessHandoffPreventBaseLobby(
  data: Record<string, unknown>,
): void {
  if (!handoffInProgress) return;
  emit('[POST SUCCESS HANDOFF PREVENT BASE LOBBY]', {
    selectedKind: selectedNext?.kind ?? null,
    selectedBanId: selectedNext?.banId ?? null,
    ...data,
  });
}

export function logPostSuccessHandoffPreventDeferredLobby(
  data: Record<string, unknown>,
): void {
  if (!handoffInProgress) return;
  emit('[POST SUCCESS HANDOFF PREVENT DEFERRED LOBBY]', {
    selectedKind: selectedNext?.kind ?? null,
    selectedBanId: selectedNext?.banId ?? null,
    ...data,
  });
}

export function logPostSuccessHandoffStartTooLateBug(
  data: Record<string, unknown>,
): void {
  if (earlyArmDone || handoffInProgress) return;
  if (!successExitWindowOpen) return;
  const queueLen = Number(data.queueLen ?? 0);
  const pendingStartup = data.pendingStartup === true;
  const expectedHandoff =
    data.expectedHandoff === true || queueLen > 0 || pendingStartup;
  if (!expectedHandoff) return;
  emit('[POST SUCCESS HANDOFF START TOO LATE BUG]', data);
}

export function setPostSuccessHandoffSelectedNext(
  kind: string | null,
  banId: string | null,
  extra?: Record<string, unknown>,
): void {
  if (!handoffInProgress) return;
  selectedNext =
    kind != null ? { kind, banId: banId?.trim() ? banId : null } : null;
  emit('[POST SUCCESS HANDOFF NEXT SELECTED]', {
    kind: selectedNext?.kind ?? null,
    banId: selectedNext?.banId ?? null,
    ...extra,
  });
  notify();
}

export function shouldBlockLobbyOpenForPostSuccessHandoff(
  queueLen: number,
  pendingLen: number,
  source?: string,
): boolean {
  if (!handoffInProgress) return false;
  const hasSelected = selectedNext != null;
  const hasQueue = queueLen > 0 || pendingLen > 0;
  const awaitingDrain = earlyArmDone && !hasSelected && !hasQueue;
  if (hasSelected || hasQueue || awaitingDrain) {
    emit('[POST SUCCESS HANDOFF PREVENT LOBBY]', {
      source: source ?? null,
      queueLen,
      pendingLen,
      selectedKind: selectedNext?.kind ?? null,
      selectedBanId: selectedNext?.banId ?? null,
      awaitingDrain,
    });
    emit('[LOBBY OPEN BLOCKED BY POST SUCCESS HANDOFF]', {
      source: source ?? null,
      queueLen,
      pendingLen,
      selectedKind: selectedNext?.kind ?? null,
      selectedBanId: selectedNext?.banId ?? null,
      awaitingDrain,
    });
    return true;
  }
  return false;
}

export function logPostSuccessHandoffWaitingMount(
  data: Record<string, unknown>,
): void {
  if (!handoffInProgress) return;
  emit('[POST SUCCESS HANDOFF WAITING MOUNT]', {
    selectedKind: selectedNext?.kind ?? null,
    selectedBanId: selectedNext?.banId ?? null,
    ...data,
  });
}

export function logPostSuccessHandoffLostBug(
  data: Record<string, unknown>,
): void {
  if (!handoffInProgress) return;
  emit('[POST SUCCESS HANDOFF LOST BUG]', {
    selectedKind: selectedNext?.kind ?? null,
    selectedBanId: selectedNext?.banId ?? null,
    ...data,
  });
}

export function completePostSuccessHandoffOnCardMounted(
  kind: string,
  banId: string,
  extra?: Record<string, unknown>,
): void {
  if (!handoffInProgress) return;
  emit('[POST SUCCESS HANDOFF CARD MOUNTED]', {
    kind,
    banId,
    ...extra,
  });
  handoffInProgress = false;
  selectedNext = null;
  earlyArmDone = false;
  successExitWindowOpen = false;
  notify();
}

export function completePostSuccessHandoffEmptyOpenLobby(
  data: Record<string, unknown>,
): void {
  if (!handoffInProgress) return;
  emit('[POST SUCCESS HANDOFF EMPTY OPEN LOBBY]', data);
  handoffInProgress = false;
  selectedNext = null;
  earlyArmDone = false;
  successExitWindowOpen = false;
  emptyFinalizedTraceId = null;
  notify();
}

export function abortPostSuccessHandoff(source: string): void {
  if (!handoffInProgress) return;
  handoffInProgress = false;
  selectedNext = null;
  earlyArmDone = false;
  successExitWindowOpen = false;
  notify();
  emit('[POST SUCCESS HANDOFF LOST BUG]', { source, reason: 'aborted' });
}

/** End mount-wait handoff when user starts reply compose from an incoming card. */
export function abortPostSuccessHandoffForReplyCompose(
  source: string,
  banId: string,
  extra?: Record<string, unknown>,
): boolean {
  if (!handoffInProgress) return false;

  const normBanId = banId.trim();
  const selectedKindBefore = selectedNext?.kind ?? null;
  const selectedBanIdBefore = selectedNext?.banId ?? null;
  const selectedRelatesToReply =
    selectedNext == null ||
    selectedKindBefore === 'incoming' ||
    (selectedBanIdBefore != null &&
      normBanId.length > 0 &&
      selectedBanIdBefore === normBanId);

  handoffInProgress = false;
  selectedNext = null;
  earlyArmDone = false;
  successExitWindowOpen = false;
  notify();

  emit('[POST SUCCESS HANDOFF ABORTED FOR REPLY]', {
    source,
    banId: normBanId || banId,
    selectedKindBefore,
    selectedBanIdBefore,
    selectedRelatesToReply,
    pendingLen: extra?.pendingLen ?? null,
    queueLen: extra?.queueLen ?? null,
    reason: 'incoming-reply-compose-start',
    ...extra,
  });
  return true;
}
