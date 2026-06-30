'use client';

import { overlayQueueKey, type QueuedOverlay } from '@/lib/overlay-queue';
import { normalizeId } from '@/lib/normalize-json';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { timestamp: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

function queueHeadFields(head: QueuedOverlay | null | undefined) {
  if (!head) {
    return { key: null, kind: null, banId: null };
  }
  const banId =
    head.kind === 'result' ? head.result.id : head.ban.id;
  return {
    key: overlayQueueKey(head),
    kind: head.kind,
    banId,
  };
}

function resolveDisplayKind(display: {
  directResultOverlayActive?: boolean;
  directResultOverlay?: boolean;
  result?: { id: string } | null;
  checkBan?: { id: string } | null;
  incomingBan?: { id: string } | null;
}): string | null {
  if (display.directResultOverlayActive || display.directResultOverlay) {
    return 'result-direct';
  }
  if (display.result?.id) return 'result';
  if (display.checkBan?.id) return 'check';
  if (display.incomingBan?.id) return 'incoming';
  return null;
}

function resolveActiveKey(
  kind: string | null | undefined,
  banId: string | null | undefined,
): string | null {
  const norm = normalizeId(banId ?? '');
  if (!kind || !norm) return null;
  return `${kind}:${norm}`;
}

export type GoToBansPayloadSwitchTraceSnapshot = {
  currentActiveKey: string | null;
  currentActiveKind: string | null;
  currentActiveBanId: string | null;
  currentDisplayKind: string | null;
  currentResultKey: string | null;
  resultBanId: string | null;
  ownerQueueHeadKey: string | null;
  ownerQueueHeadKind: string | null;
  ownerQueueHeadBanId: string | null;
  ownerQueueLen: number;
  runtimeQueueHeadKey: string | null;
  runtimeQueueHeadKind: string | null;
  runtimeQueueHeadBanId: string | null;
  runtimeQueueLen: number;
  pendingLen: number;
  ownerDirectActive: boolean;
  willRender: boolean;
};

export function buildGoToBansPayloadSwitchTraceSnapshot(input: {
  owner: {
    active: {
      kind: string | null;
      banId: string | null;
    };
    display: {
      directResultOverlayActive?: boolean;
      directResultOverlay?: boolean;
      result?: { id: string } | null;
      checkBan?: { id: string } | null;
      incomingBan?: { id: string } | null;
    };
    queue: QueuedOverlay[];
    pending: QueuedOverlay[];
  };
  runtimeOverlayQueue: QueuedOverlay[];
  pendingLen: number;
  ownerDirectActive: boolean;
  willRender: boolean;
}): GoToBansPayloadSwitchTraceSnapshot {
  const ownerHead = queueHeadFields(input.owner.queue[0]);
  const runtimeHead = queueHeadFields(input.runtimeOverlayQueue[0]);
  const resultBanId = input.owner.display.result?.id ?? null;
  return {
    currentActiveKey: resolveActiveKey(
      input.owner.active.kind,
      input.owner.active.banId,
    ),
    currentActiveKind: input.owner.active.kind,
    currentActiveBanId: input.owner.active.banId,
    currentDisplayKind: resolveDisplayKind(input.owner.display),
    currentResultKey: resultBanId
      ? `result:${normalizeId(resultBanId)}`
      : null,
    resultBanId,
    ownerQueueHeadKey: ownerHead.key,
    ownerQueueHeadKind: ownerHead.kind,
    ownerQueueHeadBanId: ownerHead.banId,
    ownerQueueLen: input.owner.queue.length,
    runtimeQueueHeadKey: runtimeHead.key,
    runtimeQueueHeadKind: runtimeHead.kind,
    runtimeQueueHeadBanId: runtimeHead.banId,
    runtimeQueueLen: input.runtimeOverlayQueue.length,
    pendingLen: input.pendingLen,
    ownerDirectActive: input.ownerDirectActive,
    willRender: input.willRender,
  };
}

export function logGoToBansPayloadSwitchTraceClick(
  data: GoToBansPayloadSwitchTraceSnapshot & Record<string, unknown>,
): void {
  emit('GO_TO_BANS_PAYLOAD_SWITCH_TRACE_CLICK', data);
}

export function logGoToBansAfterFinalize(
  data: GoToBansPayloadSwitchTraceSnapshot & {
    consumedKey: string | null;
    consumedKind: string | null;
    consumedBanId: string | null;
    removedFromOwnerQueue: boolean;
    removedFromRuntimeQueue: boolean;
  } & Record<string, unknown>,
): void {
  emit('GO_TO_BANS_AFTER_FINALIZE', data);
}

export function logNextPayloadSelectionTrace(
  data: {
    candidateSource:
      | 'owner.queue'
      | 'runtime.overlayQueue'
      | 'pending'
      | 'resultRef'
      | 'display-patch'
      | 'none';
    candidateKey: string | null;
    candidateKind: string | null;
    candidateBanId: string | null;
    previousActiveKey: string | null;
    previousActiveKind: string | null;
    previousActiveBanId: string | null;
    nextActiveKey: string | null;
    nextActiveKind: string | null;
    nextActiveBanId: string | null;
    selectionReason: string;
    activeUnchangedReason: string | null;
    source?: string | null;
    eventType?: string | null;
  } & Record<string, unknown>,
): void {
  emit('NEXT_PAYLOAD_SELECTION_TRACE', data);
}

export function logProvidersResultStaleActiveTrace(
  data: {
    activePayloadKey: string | null;
    activePayloadKind: string | null;
    activePayloadBanId: string | null;
    resultPayloadKey: string | null;
    resultPayloadKind: string | null;
    resultPayloadBanId: string | null;
    nextQueueHeadKey: string | null;
    nextQueueHeadKind: string | null;
    nextQueueHeadBanId: string | null;
    runtimeQueueHeadKey: string | null;
    runtimeQueueHeadKind: string | null;
    runtimeQueueHeadBanId: string | null;
    renderSourceOfTruth: string;
    resultStillShowableReason: string;
    nextPayloadNotActiveReason: string;
  } & Record<string, unknown>,
): void {
  emit('PROVIDERS_RESULT_STALE_ACTIVE_TRACE', data);
}

export function logResultVisibleOwnerActiveSync(
  data: {
    previousActiveKind: string | null;
    previousActiveBanId: string | null;
    resultKind: string;
    resultBanId: string;
    resultId: string;
    ownerDisplayKindAfter: string | null;
    ownerActiveKindAfter: string | null;
    reason: 'visible-direct-result-sync-before-go-to-bans';
  } & Record<string, unknown>,
): void {
  emit('RESULT_VISIBLE_OWNER_ACTIVE_SYNC', data);
}

export function logResultGoToBansOwnerTransition(
  data: Record<string, unknown>,
): void {
  emit('RESULT_GO_TO_BANS_OWNER_TRANSITION', data);
}

export function logGoToBansNextOverlayAtomicCommit(
  data: {
    consumedResultKey: string;
    nextKey: string | null;
    nextKind: string | null;
    queueLenBefore: number;
    queueLenAfter: number;
    displayKindAfter: string | null;
    activeKindAfter: string | null;
    showedBansLayer: boolean;
  } & Record<string, unknown>,
): void {
  emit('GO_TO_BANS_NEXT_OVERLAY_ATOMIC_COMMIT', data);
}

export function logResultReopenBlockedByOwnerConsumed(
  data: Record<string, unknown>,
): void {
  emit('RESULT_REOPEN_BLOCKED_BY_OWNER_CONSUMED', data);
}

export function logNextPayloadSelectionFromOwnerSync(
  previousState: {
    active: { kind: string | null; banId: string | null };
    queue: QueuedOverlay[];
  },
  nextState: {
    active: { kind: string | null; banId: string | null };
    queue: QueuedOverlay[];
  },
  eventType?: string | null,
): void {
  const goToBansRelated =
    eventType === 'RESULT_GO_TO_BANS' ||
    eventType === 'CHAIN_CONTINUE_REQUESTED' ||
    eventType === 'SHADOW_QUEUE_APPLIED' ||
    eventType === 'NOTIFICATION_DISMISSED' ||
    (eventType?.includes('go-to-bans') ?? false);
  if (!goToBansRelated) return;

  const head = queueHeadFields(nextState.queue[0]);
  const prevKey = resolveActiveKey(
    previousState.active.kind,
    previousState.active.banId,
  );
  const nextKey = resolveActiveKey(nextState.active.kind, nextState.active.banId);
  const activeChanged = prevKey !== nextKey;
  logNextPayloadSelectionTrace({
    candidateSource: head.key ? 'owner.queue' : 'none',
    candidateKey: head.key,
    candidateKind: head.kind,
    candidateBanId: head.banId,
    previousActiveKey: prevKey,
    previousActiveKind: previousState.active.kind,
    previousActiveBanId: previousState.active.banId,
    nextActiveKey: nextKey,
    nextActiveKind: nextState.active.kind,
    nextActiveBanId: nextState.active.banId,
    selectionReason: head.key
      ? 'syncActiveFromQueueHead:owner-queue-head'
      : 'syncActiveFromQueueHead:queue-empty-clear-active',
    activeUnchangedReason: activeChanged
      ? null
      : prevKey === nextKey && prevKey != null
        ? 'active-already-matches-queue-head'
        : 'active-remains-null-no-queue-head',
    eventType: eventType ?? null,
    source: 'notification-overlay-owner:syncActiveFromQueueHead',
  });
}
