'use client';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export type PendingOutsideOwnerSignals = {
  lobbyBansAttentionHint: number;
  persistedAttentionHint: number;
  runtimeQueueLen: number;
  runtimePendingLen: number;
  incomingRefPresent: boolean;
  checkRefPresent: boolean;
  resultRefPresent: boolean;
  bufferedIncomingPresent: boolean;
  lastSessionIncomingPresent: boolean;
  startupPendingLen: number;
  hasPendingOutsideOwner: boolean;
};

export function logOwnerQueueEmptyDuringChain(
  data: {
    source: string;
    previousQueueLen: number;
    previousPendingLen: number;
    queueLenAfter: number;
    pendingLenAfter: number;
    activeKind: string | null;
    displayKind: string | null;
    lastConsumedKey: string | null;
    lastOutcome: string | null;
    notificationChainActive: boolean;
    hasPendingNotificationChain: boolean;
    lobbyBansAttentionHint: number;
    runtimeQueueLen: number;
    runtimePendingLen: number;
    backendPendingCount: number | null;
  } & PendingOutsideOwnerSignals &
    Record<string, unknown>,
): void {
  emit('OWNER_QUEUE_EMPTY_DURING_CHAIN', data);
}

export function logChainEndedWithIndicatorStillOn(
  data: {
    source: string;
    outcome: string;
    ownerQueueLen: number;
    ownerPendingLen: number;
    ownerPrimaryShellQueueLen: number;
    ownerPrimaryShellPendingLen: number;
    lobbyBansAttentionHint: number;
    indicatorReason: string;
    canDrain: boolean;
    chainEndReason: string;
    indicatorVisible: boolean;
  } & Record<string, unknown>,
): void {
  emit('CHAIN_ENDED_WITH_INDICATOR_STILL_ON', data);
}

export function logLobbyClickNoPrefetchPath(
  data: {
    source: string;
    indicatorReason: string;
    canDrain: boolean;
    ownerQueueLen: number;
    ownerPendingLen: number;
    hasPendingNotificationChain: boolean;
    lobbyBansAttentionHint: number;
    wasPrefetchAttempted: false;
    reason: 'owner-empty-no-prefetch';
  } & Record<string, unknown>,
): void {
  emit('LOBBY_CLICK_NO_PREFETCH_PATH', data);
}

export function logPostSuccessPrefetchRehydratedChain(
  data: {
    source: 'post_success';
    ownerQueueLenBefore: number;
    ownerPendingLenBefore: number;
    fetchedCount: number;
    enqueuedCount: number;
    ownerQueueLenAfter: number;
    ownerPendingLenAfter: number;
    startedChain: boolean;
    phase: string;
  } & Record<string, unknown>,
): void {
  emit('POST_SUCCESS_PREFETCH_REHYDRATED_CHAIN', data);
}

export type BackendPendingFetchItem = {
  kind: string;
  banId: string;
  key: string;
};

export function buildBackendPendingFetchItems(input: {
  incoming: Array<{ id: string }>;
  check: { id: string } | null;
  result: { id: string } | null;
}): BackendPendingFetchItem[] {
  const items: BackendPendingFetchItem[] = [];
  for (const ban of input.incoming) {
    items.push({ kind: 'incoming', banId: ban.id, key: `incoming:${ban.id}` });
  }
  if (input.check?.id) {
    items.push({
      kind: 'check',
      banId: input.check.id,
      key: `check:${input.check.id}`,
    });
  }
  if (input.result?.id) {
    items.push({
      kind: 'result',
      banId: input.result.id,
      key: `result:${input.result.id}`,
    });
  }
  return items;
}

export function logBackendPendingFetchResult(
  data: {
    source: string;
    endpoint: string;
    fetchedCount: number;
    items: BackendPendingFetchItem[];
    insertedIntoOwner: boolean;
    insertedIntoOwnerQueue: boolean;
    insertedIntoOwnerPending: boolean;
    enqueuedCount: number;
    notInsertedReason: string | null;
    ownerQueueLenBefore: number;
    ownerPendingLenBefore: number;
    ownerQueueLenAfter: number;
    ownerPendingLenAfter: number;
  } & Record<string, unknown>,
): void {
  emit('BACKEND_PENDING_FETCH_RESULT', data);
}
