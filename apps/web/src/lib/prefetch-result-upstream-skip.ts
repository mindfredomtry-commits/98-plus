'use client';

import type { NotificationOverlayOwnerState } from '@/notification-owner/notification-owner-pin-state';
import { normalizeId } from './normalize-json';
import type { QueuedOverlay } from './overlay-queue';

export type PrefetchResultSkipMatchedBy =
  | 'activeResult'
  | 'queueHead'
  | 'closingResult'
  | 'shownKey'
  | 'ownerPending'
  | 'ownerQueue';

function isSameResultBanId(item: QueuedOverlay, banId: string): boolean {
  return item.kind === 'result' && normalizeId(item.result.id) === banId;
}

export function resolvePrefetchResultAlreadyActiveOrShownSkip(input: {
  banId: string;
  owner: NotificationOverlayOwnerState;
  closingResultBanId: string | null;
  legacyShownOverlayKeys: ReadonlySet<string>;
}): PrefetchResultSkipMatchedBy | null {
  const banId = normalizeId(input.banId);
  if (!banId) return null;

  const { owner } = input;
  const activeBanId = normalizeId(owner.active.banId ?? '');
  const displayResultId = normalizeId(owner.display.result?.id ?? '');

  if (
    (owner.active.kind === 'result' && activeBanId === banId) ||
    displayResultId === banId
  ) {
    return 'activeResult';
  }

  const queueHead = owner.queue[0] ?? null;
  if (queueHead && isSameResultBanId(queueHead, banId)) {
    return 'queueHead';
  }

  const closingBanId = normalizeId(input.closingResultBanId ?? '');
  if (closingBanId.length > 0 && closingBanId === banId) {
    return 'closingResult';
  }

  const overlayKey = `result:${banId}`;
  if (
    owner.session.shownOverlayKeys.has(overlayKey) ||
    input.legacyShownOverlayKeys.has(overlayKey)
  ) {
    return 'shownKey';
  }

  if (owner.pending.some((item) => isSameResultBanId(item, banId))) {
    return 'ownerPending';
  }

  if (owner.queue.some((item) => isSameResultBanId(item, banId))) {
    return 'ownerQueue';
  }

  return null;
}

export function logPrefetchResultSkippedAlreadyActiveOrShown(data: {
  banId: string;
  resultId: string;
  source: string;
  reason: string;
  matchedBy: PrefetchResultSkipMatchedBy;
}): void {
  const timestamp = performance.now();
  const payload = { timestamp, t: timestamp, ...data };
  console.log('PREFETCH_RESULT_SKIPPED_ALREADY_ACTIVE_OR_SHOWN', payload);
  window.__debug98log?.('PREFETCH_RESULT_SKIPPED_ALREADY_ACTIVE_OR_SHOWN', payload);
}
