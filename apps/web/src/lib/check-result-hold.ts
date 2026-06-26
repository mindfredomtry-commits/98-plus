import type { QueuedOverlay } from '@/lib/overlay-queue';
import { normalizeId } from '@/lib/normalize-json';
import { overlayBanId, overlayQueueKey } from '@/lib/overlay-queue';

/** Bounded wait for check-answer final result before advancing queue (5 × 450ms). */
export const CHECK_ANSWER_RESULT_HOLD_TIMEOUT_MS = 2250;

export function shouldDeferCheckAnswerResultWindowApply(
  reason: string,
  dismissBanId: string | null,
  checkInFlight: ReadonlySet<string>,
): boolean {
  if (reason !== 'user-answer') return false;
  if (!dismissBanId) return false;
  const normalizedBanId = normalizeId(dismissBanId);
  if (!normalizedBanId) return false;
  return checkInFlight.has(normalizedBanId);
}

export function resolveQueueOverlayBanId(
  item: QueuedOverlay | null | undefined,
): string | null {
  if (!item) return null;
  if (item.kind === 'result') return normalizeId(item.result.id) || null;
  return normalizeId(item.ban.id) || null;
}

export function resolveMountedActiveHeadBanId(opts: {
  queueHead: QueuedOverlay | null;
  checkBanId: string | null;
  incomingBanId: string | null;
  resultBanId: string | null;
  heldKind: QueuedOverlay['kind'] | null;
  heldBanId: string | null;
}): { kind: QueuedOverlay['kind']; banId: string } | null {
  if (opts.heldKind && opts.heldBanId) {
    return { kind: opts.heldKind, banId: opts.heldBanId };
  }
  if (opts.checkBanId) {
    return { kind: 'check', banId: opts.checkBanId };
  }
  if (opts.incomingBanId) {
    return { kind: 'incoming', banId: opts.incomingBanId };
  }
  if (opts.resultBanId) {
    return { kind: 'result', banId: opts.resultBanId };
  }
  const headBanId = resolveQueueOverlayBanId(opts.queueHead);
  if (opts.queueHead && headBanId) {
    return { kind: opts.queueHead.kind, banId: headBanId };
  }
  return null;
}

/** True when a check-answer result must not replace the currently mounted head card. */
export function shouldQueueLateCheckResultAfterHead(
  resultBanId: string,
  holdBanId: string | null,
  activeHeadBanId: string | null,
  pendingFirstShow: boolean,
): boolean {
  const resultNorm = normalizeId(resultBanId);
  if (!resultNorm) return false;
  const holdNorm = normalizeId(holdBanId ?? '');
  if (holdNorm && holdNorm === resultNorm) return false;
  const headNorm = normalizeId(activeHeadBanId ?? '');
  if (!headNorm || headNorm === resultNorm) return false;
  if (pendingFirstShow && !holdNorm) {
    return true;
  }
  return headNorm !== resultNorm;
}

/** Insert result after current queue head — never replaces an active head card. */
export function appendResultAfterQueueHead(
  queue: QueuedOverlay[],
  resultItem: QueuedOverlay,
): QueuedOverlay[] {
  const resultKey = overlayQueueKey(resultItem);
  const resultBanNorm = normalizeId(overlayBanId(resultItem));
  const withoutDup = queue.filter((item) => {
    const key = overlayQueueKey(item);
    if (key === resultKey) return false;
    if (resultBanNorm && normalizeId(overlayBanId(item)) === resultBanNorm) {
      return false;
    }
    return true;
  });
  if (withoutDup.length === 0) {
    return [resultItem];
  }
  return [withoutDup[0], resultItem, ...withoutDup.slice(1)];
}
