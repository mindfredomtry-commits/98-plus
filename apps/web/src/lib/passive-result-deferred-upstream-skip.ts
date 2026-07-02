'use client';

import type { NotificationOverlayOwnerState } from './notification-overlay-owner';
import { normalizeId } from './normalize-json';
import type { QueuedOverlay } from './overlay-queue';

export type PassiveResultDeferredSkipMatchedBy =
  | 'activeResult'
  | 'ownerDisplayResult'
  | 'directResultOpen'
  | 'resultOpening'
  | 'queueHead'
  | 'closingResult'
  | 'goToBansSessionTrace'
  | 'shownKey'
  | 'ownerPending'
  | 'ownerQueue'
  | 'resultOverlayPrimeInflight'
  | 'overboardInFlight'
  | 'heldResultCard'
  | 'freshOverboardAction'
  | 'freshFinalStatus';

function isSameResultBanId(item: QueuedOverlay, banId: string): boolean {
  return item.kind === 'result' && normalizeId(item.result.id) === banId;
}

export function resolvePassiveResultDeferredAlreadyActiveOrShownSkip(input: {
  banId: string;
  owner: NotificationOverlayOwnerState;
  closingResultBanId: string | null;
  goToBansSessionTraceBlocked: boolean;
  legacyShownOverlayKeys: ReadonlySet<string>;
  directResultOpen: boolean;
  resultOpening: boolean;
  mountedResultBanId: string | null;
  heldUserCardKind: string | null;
  heldResultBanId: string | null;
  overboardInFlightBanId: string | null;
  resultOverlayPrimeInflightForBan: boolean;
  freshOverboardActionForBan: boolean;
  freshFinalStatusForBan: boolean;
}): PassiveResultDeferredSkipMatchedBy | null {
  const banId = normalizeId(input.banId);
  if (!banId) return null;

  const { owner } = input;
  const activeBanId = normalizeId(owner.active.banId ?? '');
  const displayResultId = normalizeId(owner.display.result?.id ?? '');
  const mountedBanId = normalizeId(input.mountedResultBanId ?? '');

  if (owner.active.kind === 'result' && activeBanId === banId) {
    return 'activeResult';
  }
  if (displayResultId === banId) {
    return 'ownerDisplayResult';
  }
  if (
    input.directResultOpen &&
    (displayResultId === banId ||
      mountedBanId === banId ||
      activeBanId === banId)
  ) {
    return 'directResultOpen';
  }
  if (input.resultOpening && mountedBanId === banId) {
    return 'resultOpening';
  }

  const queueHead = owner.queue[0] ?? null;
  if (queueHead && isSameResultBanId(queueHead, banId)) {
    return 'queueHead';
  }

  const closingBanId = normalizeId(input.closingResultBanId ?? '');
  if (closingBanId.length > 0 && closingBanId === banId) {
    return 'closingResult';
  }
  if (input.goToBansSessionTraceBlocked) {
    return 'goToBansSessionTrace';
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

  if (input.resultOverlayPrimeInflightForBan) {
    return 'resultOverlayPrimeInflight';
  }
  if (normalizeId(input.overboardInFlightBanId ?? '') === banId) {
    return 'overboardInFlight';
  }
  if (input.heldUserCardKind === 'result') {
    const heldBanId = normalizeId(input.heldResultBanId ?? '');
    if (heldBanId.length > 0 && heldBanId === banId) {
      return 'heldResultCard';
    }
  }
  if (input.freshOverboardActionForBan) {
    return 'freshOverboardAction';
  }
  if (input.freshFinalStatusForBan) {
    return 'freshFinalStatus';
  }

  return null;
}

export function logPassiveResultDeferredBlockedByPassiveOpenGuard(data: {
  banId: string;
  resultId: string;
  source: string;
  reason: string;
  pendingLen: number;
  queueLen: number;
  activeKind: string | null;
  ownerActiveKind: string | null;
  ownerDisplayKind: string | null;
  directResultOpen: boolean;
  closingResultBanId: string | null;
}): void {
  const timestamp = performance.now();
  const payload = { timestamp, t: timestamp, ...data };
  console.log('PASSIVE_RESULT_DEFERRED_BLOCKED_BY_PASSIVE_OPEN_GUARD', payload);
  window.__debug98log?.(
    'PASSIVE_RESULT_DEFERRED_BLOCKED_BY_PASSIVE_OPEN_GUARD',
    payload,
  );
}

export function logPassiveResultDeferredSkippedAlreadyActiveOrShown(data: {
  banId: string;
  resultId: string;
  source: string;
  reason: string;
  matchedBy: PassiveResultDeferredSkipMatchedBy;
  activeKind: string | null;
  ownerActiveKind: string | null;
  ownerDisplayKind: string | null;
  pendingLen: number;
  queueLen: number;
  directResultOpen: boolean;
  closingResultBanId: string | null;
}): void {
  const timestamp = performance.now();
  const payload = { timestamp, t: timestamp, ...data };
  console.log('PASSIVE_RESULT_DEFERRED_SKIPPED_ALREADY_ACTIVE_OR_SHOWN', payload);
  window.__debug98log?.(
    'PASSIVE_RESULT_DEFERRED_SKIPPED_ALREADY_ACTIVE_OR_SHOWN',
    payload,
  );
}
