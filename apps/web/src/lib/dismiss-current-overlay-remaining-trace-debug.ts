'use client';

import type { QueuedOverlay } from '@/lib/overlay-queue';
import { queueHeadIdFrom } from '@/lib/queue-head-lifecycle-trace-debug';
import {
  diagTraceNow,
  emitClientDiagTrace,
  isClientDiagTraceEnvironment,
} from '@/lib/diag-trace-client';

export type DismissCurrentOverlayRemainingTraceInput = {
  reason: string;
  prevQueue: QueuedOverlay[];
  prevQueueHead: QueuedOverlay | null;
  remaining: QueuedOverlay[];
  currentOverlayKind: string | null;
  currentOverlayId: string | null;
  ownerQueueLen: number;
  ownerPendingLen: number;
  overlayQueueRefLength: number;
  overlayQueueStateLength: number;
  queueClaimsNotificationScreen: boolean;
  notificationOverlayVisible: boolean;
  visualQueueDimSessionLive: boolean;
  actionAgeMs: number | null;
  caller: string;
  source: string;
};

export type DismissCurrentOverlayRemainingTrace = {
  timestamp: number;
  reason: string;
  prevQueueLength: number;
  prevQueueHeadKind: string | null;
  prevQueueHeadId: string | null;
  prevQueueAllKinds: string[];
  currentOverlayKind: string | null;
  currentOverlayId: string | null;
  removedHeadKind: string | null;
  removedHeadId: string | null;
  remainingLength: number;
  remainingKinds: string[];
  remainingIds: string[];
  ownerQueueLen: number;
  ownerPendingLen: number;
  overlayQueueRefLength: number;
  overlayQueueStateLength: number;
  queueClaimsNotificationScreen: boolean;
  notificationOverlayVisible: boolean;
  visualQueueDimSessionLive: boolean;
  actionAgeMs: number | null;
  caller: string;
  source: string;
  hadCheckAfterHeadInPrevQueue: boolean;
  stack: string | null;
};

function overlayQueueKinds(queue: QueuedOverlay[]): string[] {
  return queue.map((item) => item.kind);
}

function overlayQueueIds(queue: QueuedOverlay[]): string[] {
  return queue
    .map((item) => queueHeadIdFrom(item))
    .filter((id): id is string => id != null);
}

function captureStack(): string | null {
  try {
    return new Error('DISMISS_CURRENT_OVERLAY_REMAINING_TRACE').stack ?? null;
  } catch {
    return null;
  }
}

export function logDismissCurrentOverlayRemainingTrace(
  input: DismissCurrentOverlayRemainingTraceInput,
): void {
  if (!isClientDiagTraceEnvironment()) return;

  const removedHead = input.prevQueueHead;
  const removedHeadKind = removedHead?.kind ?? null;
  const removedHeadId = queueHeadIdFrom(removedHead);
  const prevQueueAllKinds = overlayQueueKinds(input.prevQueue);
  const remainingKinds = overlayQueueKinds(input.remaining);
  const hadCheckAfterHeadInPrevQueue = input.prevQueue
    .slice(1)
    .some((item) => item.kind === 'check');

  const payload: DismissCurrentOverlayRemainingTrace = {
    timestamp: diagTraceNow(),
    reason: input.reason,
    prevQueueLength: input.prevQueue.length,
    prevQueueHeadKind: removedHeadKind,
    prevQueueHeadId: removedHeadId,
    prevQueueAllKinds,
    currentOverlayKind: input.currentOverlayKind,
    currentOverlayId: input.currentOverlayId,
    removedHeadKind,
    removedHeadId,
    remainingLength: input.remaining.length,
    remainingKinds,
    remainingIds: overlayQueueIds(input.remaining),
    ownerQueueLen: input.ownerQueueLen,
    ownerPendingLen: input.ownerPendingLen,
    overlayQueueRefLength: input.overlayQueueRefLength,
    overlayQueueStateLength: input.overlayQueueStateLength,
    queueClaimsNotificationScreen: input.queueClaimsNotificationScreen,
    notificationOverlayVisible: input.notificationOverlayVisible,
    visualQueueDimSessionLive: input.visualQueueDimSessionLive,
    actionAgeMs: input.actionAgeMs,
    caller: input.caller,
    source: input.source,
    hadCheckAfterHeadInPrevQueue,
    stack: captureStack(),
  };

  emitClientDiagTrace('DISMISS_CURRENT_OVERLAY_REMAINING_TRACE', payload);
}
