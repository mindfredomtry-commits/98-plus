'use client';

import type {
  NotificationOverlayOwnerEvent,
  NotificationOverlayOwnerState,
} from '@/lib/notification-overlay-owner';
import { readGoToBansSessionTrace } from '@/lib/go-to-bans-session-trace-debug';
import type { QueuedOverlay } from '@/lib/overlay-queue';
import { overlayBanId, overlayQueueKey } from '@/lib/overlay-queue';
import { normalizeId } from '@/lib/normalize-json';

function emit(event: string, data: Record<string, unknown>): void {
  const timestamp = performance.now();
  const payload = { timestamp, t: timestamp, ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export type PendingResultSourceTraceStage =
  | 'pending-add'
  | 'before-merge'
  | 'merge-input'
  | 'merge-commit'
  | 'after-commit'
  | 'pending-not-cleared';

export type PendingResultSourceTracePayload = {
  stage: PendingResultSourceTraceStage;
  source: string;
  reason: string;
  event: string | null;
  pendingLenBefore: number;
  pendingLenAfter: number;
  queueLenBefore: number;
  queueLenAfter: number;
  pendingHeadKind: string | null;
  pendingHeadBanId: string | null;
  pendingHeadResultId: string | null;
  pendingHeadOverlayKey: string | null;
  queueHeadKind: string | null;
  queueHeadBanId: string | null;
  queueHeadResultId: string | null;
  queueHeadOverlayKey: string | null;
  lastGoToBansBanId: string | null;
  lastGoToBansResultId: string | null;
  isPendingSameAsLastGoToBans: boolean;
  isQueueHeadSameAsLastGoToBans: boolean;
  activeKindBefore: string | null;
  activeKindAfter: string | null;
  timestamp?: number;
};

const pendingResultObjectByOverlayKey = new Map<string, QueuedOverlay>();

function formatOverlayHead(item: QueuedOverlay | null | undefined): {
  kind: string | null;
  banId: string | null;
  resultId: string | null;
  overlayKey: string | null;
} {
  if (!item) {
    return { kind: null, banId: null, resultId: null, overlayKey: null };
  }
  const banId = normalizeId(overlayBanId(item)) || null;
  return {
    kind: item.kind,
    banId,
    resultId: item.kind === 'result' ? banId : null,
    overlayKey: overlayQueueKey(item),
  };
}

function matchesLastGoToBans(
  banId: string | null,
  lastBanId: string | null,
): boolean {
  const lastNorm = normalizeId(lastBanId ?? '');
  const banNorm = normalizeId(banId ?? '');
  return lastNorm.length > 0 && banNorm.length > 0 && lastNorm === banNorm;
}

function collectPendingResultOverlayKeys(queue: QueuedOverlay[]): Set<string> {
  const keys = new Set<string>();
  for (const item of queue) {
    if (item.kind !== 'result') continue;
    keys.add(overlayQueueKey(item));
  }
  return keys;
}

export function findNewlyAddedOwnerPendingResultItems(
  beforePending: QueuedOverlay[],
  afterPending: QueuedOverlay[],
): QueuedOverlay[] {
  const beforeKeys = collectPendingResultOverlayKeys(beforePending);
  const newlyAdded: QueuedOverlay[] = [];
  for (const item of afterPending) {
    if (item.kind !== 'result') continue;
    const key = overlayQueueKey(item);
    if (beforeKeys.has(key)) continue;
    beforeKeys.add(key);
    newlyAdded.push(item);
  }
  return newlyAdded;
}

export function registerPendingResultObject(item: QueuedOverlay): void {
  if (item.kind !== 'result') return;
  pendingResultObjectByOverlayKey.set(overlayQueueKey(item), item);
}

export function isSamePendingResultObject(item: QueuedOverlay): boolean | null {
  if (item.kind !== 'result') return null;
  const previous = pendingResultObjectByOverlayKey.get(overlayQueueKey(item));
  if (!previous) return null;
  return previous === item;
}

export function buildPendingResultSourceTracePayload(input: {
  stage: PendingResultSourceTraceStage;
  source: string;
  reason: string;
  event?: string | null;
  before: NotificationOverlayOwnerState;
  after?: NotificationOverlayOwnerState;
  pendingHeadOverride?: QueuedOverlay | null;
  queueHeadOverride?: QueuedOverlay | null;
}): PendingResultSourceTracePayload {
  const after = input.after ?? input.before;
  const pendingHead = formatOverlayHead(
    input.pendingHeadOverride ?? after.pending[0] ?? null,
  );
  const queueHead = formatOverlayHead(
    input.queueHeadOverride ?? after.queue[0] ?? null,
  );
  const lastGoToBans = readGoToBansSessionTrace();

  return {
    stage: input.stage,
    source: input.source,
    reason: input.reason,
    event: input.event ?? null,
    pendingLenBefore: input.before.pending.length,
    pendingLenAfter: after.pending.length,
    queueLenBefore: input.before.queue.length,
    queueLenAfter: after.queue.length,
    pendingHeadKind: pendingHead.kind,
    pendingHeadBanId: pendingHead.banId,
    pendingHeadResultId: pendingHead.resultId,
    pendingHeadOverlayKey: pendingHead.overlayKey,
    queueHeadKind: queueHead.kind,
    queueHeadBanId: queueHead.banId,
    queueHeadResultId: queueHead.resultId,
    queueHeadOverlayKey: queueHead.overlayKey,
    lastGoToBansBanId: lastGoToBans?.banId ?? null,
    lastGoToBansResultId: lastGoToBans?.resultId ?? null,
    isPendingSameAsLastGoToBans: matchesLastGoToBans(
      pendingHead.banId,
      lastGoToBans?.banId ?? null,
    ),
    isQueueHeadSameAsLastGoToBans: matchesLastGoToBans(
      queueHead.banId,
      lastGoToBans?.banId ?? null,
    ),
    activeKindBefore: input.before.active.kind,
    activeKindAfter: after.active.kind,
  };
}

export function logPendingResultSourceTrace(
  data: PendingResultSourceTracePayload,
): void {
  emit('PENDING_RESULT_SOURCE_TRACE', data);
}

export function tracePendingResultSource(input: {
  stage: PendingResultSourceTraceStage;
  source: string;
  reason: string;
  event?: string | null;
  before: NotificationOverlayOwnerState;
  after?: NotificationOverlayOwnerState;
  pendingHeadOverride?: QueuedOverlay | null;
  queueHeadOverride?: QueuedOverlay | null;
}): void {
  logPendingResultSourceTrace(buildPendingResultSourceTracePayload(input));
}

export function tracePendingResultAddAfterDispatch(input: {
  event: NotificationOverlayOwnerEvent;
  source: string;
  before: NotificationOverlayOwnerState;
  after: NotificationOverlayOwnerState;
}): void {
  if (input.event.type === 'NOTIFICATION_ENQUEUED') {
    if ((input.event.scope ?? 'queue') !== 'pending') return;
    if (input.event.item.kind !== 'result') return;
  } else if (input.event.type !== 'PENDING_QUEUE_APPLIED') {
    return;
  }

  const newlyAdded = findNewlyAddedOwnerPendingResultItems(
    input.before.pending,
    input.after.pending,
  );
  if (newlyAdded.length === 0) return;

  const reason =
    input.event.type === 'NOTIFICATION_ENQUEUED'
      ? 'NOTIFICATION_ENQUEUED:pending'
      : (input.event.source ?? input.source);

  for (const item of newlyAdded) {
    const sameRef = isSamePendingResultObject(item);
    registerPendingResultObject(item);
    tracePendingResultSource({
      stage: 'pending-add',
      source: input.source,
      reason:
        sameRef === null
          ? `${reason}:new-pending-result-object`
          : sameRef
            ? `${reason}:same-pending-result-object-ref`
            : `${reason}:different-pending-result-object-ref`,
      event: input.event.type,
      before: input.before,
      after: input.after,
      pendingHeadOverride: item,
    });
  }
}

export function traceMergePendingSnapshotStage(input: {
  stage: Exclude<
    PendingResultSourceTraceStage,
    'pending-add' | 'pending-not-cleared'
  >;
  source: string;
  reason: string;
  event?: string | null;
  before: NotificationOverlayOwnerState;
  after?: NotificationOverlayOwnerState;
  snapshotHead?: QueuedOverlay | null;
  plannedQueueHead?: QueuedOverlay | null;
}): void {
  const snapshotHead = input.snapshotHead ?? null;
  const sameRef =
    snapshotHead?.kind === 'result'
      ? isSamePendingResultObject(snapshotHead)
      : null;
  const reasonSuffix =
    snapshotHead?.kind === 'result' && sameRef != null
      ? sameRef
        ? '|snapshot-same-pending-object-ref'
        : '|snapshot-new-pending-object-ref'
      : '';
  tracePendingResultSource({
    stage: input.stage,
    source: input.source,
    reason: `${input.reason}${reasonSuffix}`,
    event: input.event ?? 'QUEUE_SILENT_UPDATED',
    before: input.before,
    after: input.after,
    pendingHeadOverride: snapshotHead ?? input.before.pending[0] ?? null,
    queueHeadOverride:
      input.plannedQueueHead ?? input.after?.queue[0] ?? input.before.queue[0] ?? null,
  });
}

export function tracePendingNotClearedAfterMerge(input: {
  source: string;
  reason: string;
  before: NotificationOverlayOwnerState;
  after: NotificationOverlayOwnerState;
}): void {
  if (input.after.pending.length === 0) return;
  tracePendingResultSource({
    stage: 'pending-not-cleared',
    source: input.source,
    reason: input.reason,
    event: 'PENDING_QUEUE_APPLIED',
    before: input.before,
    after: input.after,
  });
}
