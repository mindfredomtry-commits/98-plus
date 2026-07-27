'use client';

import type { NotificationOwnerDisplayState } from '@/notification-owner/notification-owner-pin-state';
import type { QueuedOverlay } from '@/lib/overlay-queue';
import { overlayBanId } from '@/lib/overlay-queue';
import { normalizeId } from '@/lib/normalize-json';

function emit(event: string, data: Record<string, unknown>): void {
  const timestamp = performance.now();
  const payload = { timestamp, t: timestamp, ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export type QueueHeadAfterGoToBansTracePayload = {
  source: string;
  event: string;
  lastGoToBansBanId: string | null;
  lastGoToBansResultId: string | null;
  queueLen: number;
  queueHeadKind: string | null;
  queueHeadBanId: string | null;
  queueHeadResultId: string | null;
  activeKind: string | null;
  activeBanId: string | null;
  activeResultId: string | null;
  displayKind: string | null;
  displayBanId: string | null;
  displayResultId: string | null;
  isSameAsGoToBansResult: boolean;
  timestamp?: number;
};

export const QUEUE_HEAD_AFTER_GO_TO_BANS_TRACE_WINDOW_MS = 120_000;

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

function resolveQueueHeadFields(head: QueuedOverlay | null | undefined): {
  kind: string | null;
  banId: string | null;
  resultId: string | null;
} {
  if (!head) {
    return { kind: null, banId: null, resultId: null };
  }
  const banId = normalizeId(overlayBanId(head)) || null;
  return {
    kind: head.kind,
    banId,
    resultId: head.kind === 'result' ? banId : null,
  };
}

export function buildQueueHeadAfterGoToBansTracePayload(input: {
  source: string;
  event: string;
  lastGoToBansBanId: string;
  lastGoToBansResultId: string;
  queue: QueuedOverlay[];
  activeKind: string | null;
  activeBanId: string | null;
  display: NotificationOwnerDisplayState;
}): QueueHeadAfterGoToBansTracePayload {
  const head = resolveQueueHeadFields(input.queue[0] ?? null);
  const displayKind = resolveOwnerDisplayKindForTrace(input.display);
  const displayResultId = input.display.result?.id ?? null;
  const displayBanId =
    displayResultId ??
    input.display.checkBan?.id ??
    input.display.incomingBan?.id ??
    null;
  const lastNorm = normalizeId(input.lastGoToBansBanId);
  const headBanNorm = normalizeId(head.banId ?? '');
  const headResultNorm = normalizeId(head.resultId ?? '');
  const isSameAsGoToBansResult =
    (headBanNorm.length > 0 && headBanNorm === lastNorm) ||
    (headResultNorm.length > 0 && headResultNorm === lastNorm);

  return {
    source: input.source,
    event: input.event,
    lastGoToBansBanId: input.lastGoToBansBanId,
    lastGoToBansResultId: input.lastGoToBansResultId,
    queueLen: input.queue.length,
    queueHeadKind: head.kind,
    queueHeadBanId: head.banId,
    queueHeadResultId: head.resultId,
    activeKind: input.activeKind,
    activeBanId: input.activeBanId,
    activeResultId: input.activeKind === 'result' ? input.activeBanId : null,
    displayKind,
    displayBanId,
    displayResultId,
    isSameAsGoToBansResult,
  };
}

export function logQueueHeadAfterGoToBansTrace(
  data: QueueHeadAfterGoToBansTracePayload,
): void {
  emit('QUEUE_HEAD_AFTER_GO_TO_BANS_TRACE', data);
}
