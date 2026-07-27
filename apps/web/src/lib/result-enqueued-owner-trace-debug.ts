'use client';

import type {
  NotificationOwnerDisplayState,
  NotificationOverlayOwnerState,
  NotificationOverlayOwnerEvent,
} from '@/notification-owner/notification-owner-pin-state';
import type { QueuedOverlay } from '@/lib/overlay-queue';
import { overlayBanId, overlayQueueKey } from '@/lib/overlay-queue';
import { normalizeId } from '@/lib/normalize-json';
import { QUEUE_HEAD_AFTER_GO_TO_BANS_TRACE_WINDOW_MS } from '@/lib/queue-head-after-go-to-bans-trace-debug';

function emit(event: string, data: Record<string, unknown>): void {
  const timestamp = performance.now();
  const payload = { timestamp, t: timestamp, ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export type ResultEnqueuedOwnerTracePayload = {
  source: string;
  event: string;
  reason: string;
  resultBanId: string | null;
  resultId: string | null;
  overlayKey: string | null;
  queueLenBefore: number;
  queueLenAfter: number;
  pendingLenBefore: number;
  pendingLenAfter: number;
  activeKindBefore: string | null;
  activeBanIdBefore: string | null;
  activeResultIdBefore: string | null;
  activeKindAfter: string | null;
  activeBanIdAfter: string | null;
  activeResultIdAfter: string | null;
  displayKindBefore: string | null;
  displayKindAfter: string | null;
  wasRecentlyGoToBans: boolean;
  lastGoToBansBanId: string | null;
  lastGoToBansResultId: string | null;
  isSameAsLastGoToBans: boolean;
  timestamp?: number;
};

export const RESULT_ENQUEUED_OWNER_TRACE_EVENTS = new Set<
  NotificationOverlayOwnerEvent['type']
>([
  'NOTIFICATION_ENQUEUED',
  'CHECK_RESULT_ARRIVED',
  'LATE_RESULT_ARRIVED',
  'QUEUE_APPLIED',
  'QUEUE_SILENT_UPDATED',
  'PENDING_QUEUE_APPLIED',
  'STARTUP_INTERACTIONS_RELEASED',
]);

function resolveOwnerDisplayKindForTrace(
  display: NotificationOwnerDisplayState,
): string | null {
  if (display.directResultOverlayActive || display.directResultOverlay) {
    return 'result-direct';
  }
  if (display.result?.id) return 'result';
  if (display.checkBan?.id) return 'check';
  if (display.incomingBan?.id) return 'incoming';
  return null;
}

function collectResultOverlayKeys(queue: QueuedOverlay[]): Set<string> {
  const keys = new Set<string>();
  for (const item of queue) {
    if (item.kind !== 'result') continue;
    keys.add(overlayQueueKey(item));
  }
  return keys;
}

export function findNewlyEnqueuedOwnerResultItems(
  beforeQueue: QueuedOverlay[],
  afterQueue: QueuedOverlay[],
): QueuedOverlay[] {
  const beforeKeys = collectResultOverlayKeys(beforeQueue);
  const newlyEnqueued: QueuedOverlay[] = [];
  for (const item of afterQueue) {
    if (item.kind !== 'result') continue;
    const key = overlayQueueKey(item);
    if (beforeKeys.has(key)) continue;
    beforeKeys.add(key);
    newlyEnqueued.push(item);
  }
  return newlyEnqueued;
}

function resolveTraceReason(
  event: NotificationOverlayOwnerEvent,
  dispatchSource: string,
): string {
  if (
    'source' in event &&
    typeof event.source === 'string' &&
    event.source.length > 0
  ) {
    return event.source;
  }
  return dispatchSource;
}

export function buildResultEnqueuedOwnerTracePayload(input: {
  source: string;
  event: string;
  reason: string;
  resultItem: QueuedOverlay;
  before: NotificationOverlayOwnerState;
  after: NotificationOverlayOwnerState;
  lastGoToBansBanId: string | null;
  lastGoToBansResultId: string | null;
  wasRecentlyGoToBans: boolean;
}): ResultEnqueuedOwnerTracePayload {
  const resultBanId = normalizeId(overlayBanId(input.resultItem)) || null;
  const resultId =
    input.resultItem.kind === 'result'
      ? normalizeId(input.resultItem.result.id) || resultBanId
      : resultBanId;
  const overlayKey = resultBanId ? `result:${resultBanId}` : null;
  const lastNorm = normalizeId(input.lastGoToBansBanId ?? '');
  const resultNorm = normalizeId(resultBanId ?? '');

  return {
    source: input.source,
    event: input.event,
    reason: input.reason,
    resultBanId,
    resultId,
    overlayKey,
    queueLenBefore: input.before.queue.length,
    queueLenAfter: input.after.queue.length,
    pendingLenBefore: input.before.pending.length,
    pendingLenAfter: input.after.pending.length,
    activeKindBefore: input.before.active.kind,
    activeBanIdBefore: input.before.active.banId,
    activeResultIdBefore:
      input.before.active.kind === 'result' ? input.before.active.banId : null,
    activeKindAfter: input.after.active.kind,
    activeBanIdAfter: input.after.active.banId,
    activeResultIdAfter:
      input.after.active.kind === 'result' ? input.after.active.banId : null,
    displayKindBefore: resolveOwnerDisplayKindForTrace(input.before.display),
    displayKindAfter: resolveOwnerDisplayKindForTrace(input.after.display),
    wasRecentlyGoToBans: input.wasRecentlyGoToBans,
    lastGoToBansBanId: input.lastGoToBansBanId,
    lastGoToBansResultId: input.lastGoToBansResultId,
    isSameAsLastGoToBans:
      lastNorm.length > 0 && resultNorm.length > 0 && resultNorm === lastNorm,
  };
}

export function logResultEnqueuedOwnerTrace(
  data: ResultEnqueuedOwnerTracePayload,
): void {
  emit('RESULT_ENQUEUED_OWNER_TRACE', data);
}

export function traceResultEnqueuedOwnerAfterDispatch(input: {
  event: NotificationOverlayOwnerEvent;
  source: string;
  before: NotificationOverlayOwnerState;
  after: NotificationOverlayOwnerState;
  lastGoToBansAt: number | null;
  lastGoToBansBanId: string | null;
  lastGoToBansResultId: string | null;
}): void {
  if (!RESULT_ENQUEUED_OWNER_TRACE_EVENTS.has(input.event.type)) return;
  if (input.event.type === 'NOTIFICATION_ENQUEUED') {
    if ((input.event.scope ?? 'queue') === 'pending') return;
    if (input.event.item.kind !== 'result') return;
  }

  const newlyEnqueued = findNewlyEnqueuedOwnerResultItems(
    input.before.queue,
    input.after.queue,
  );
  if (newlyEnqueued.length === 0) return;

  const wasRecentlyGoToBans =
    input.lastGoToBansAt != null &&
    performance.now() - input.lastGoToBansAt <=
      QUEUE_HEAD_AFTER_GO_TO_BANS_TRACE_WINDOW_MS;
  const reason = resolveTraceReason(input.event, input.source);

  for (const resultItem of newlyEnqueued) {
    logResultEnqueuedOwnerTrace(
      buildResultEnqueuedOwnerTracePayload({
        source: input.source,
        event: input.event.type,
        reason,
        resultItem,
        before: input.before,
        after: input.after,
        lastGoToBansBanId: input.lastGoToBansBanId,
        lastGoToBansResultId: input.lastGoToBansResultId,
        wasRecentlyGoToBans,
      }),
    );
  }
}
