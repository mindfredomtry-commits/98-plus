'use client';

import type { NotificationOverlayOwnerState } from './notification-overlay-owner';
import { normalizeId } from './normalize-json';

export function resolveLobbyIndicatorResultPrefetchBlocked(input: {
  skipResults: boolean;
  owner: NotificationOverlayOwnerState;
  prefetchedResultBanId: string;
  directResultOpen: boolean;
  resultOpening: boolean;
  overboardInFlightBanId: string | null;
  atomicOverboardBanId: string | null;
  notificationChainAwaitingUser: boolean;
  heldUserCardKind: string | null;
  mountedResultBanId: string | null;
  resultOverlayPrimeInflight: boolean;
  freshOverboardActionForBan: boolean;
  freshFinalStatusForBan: boolean;
}): string | null {
  if (input.skipResults) {
    return 'lobby-indicator-prime-skip-results';
  }

  const banId = normalizeId(input.prefetchedResultBanId);
  if (!banId) return null;

  if (input.directResultOpen) {
    return 'direct-result-open';
  }
  if (input.resultOpening) {
    return 'result-opening';
  }
  if (input.resultOverlayPrimeInflight) {
    return 'result-overlay-prime-inflight';
  }
  if (normalizeId(input.overboardInFlightBanId ?? '') === banId) {
    return 'overboard-in-flight';
  }
  if (
    input.notificationChainAwaitingUser &&
    normalizeId(input.atomicOverboardBanId ?? '') === banId
  ) {
    return 'atomic-overboard-hold';
  }
  if (input.heldUserCardKind === 'result') {
    return 'held-result-card';
  }
  if (normalizeId(input.mountedResultBanId ?? '') === banId) {
    return 'mounted-result-ref';
  }
  if (
    input.owner.active.kind === 'result' &&
    normalizeId(input.owner.active.banId ?? '') === banId
  ) {
    return 'owner-active-result';
  }
  if (normalizeId(input.owner.display.result?.id ?? '') === banId) {
    return 'owner-display-result';
  }
  if (input.freshOverboardActionForBan) {
    return 'fresh-overboard-action';
  }
  if (input.freshFinalStatusForBan) {
    return 'fresh-final-status';
  }

  return null;
}

export function logLobbyIndicatorResultPrefetchSkippedDuringResultOpen(data: {
  banId: string;
  resultId: string;
  source: string;
  reason: string;
  activeKind: string | null;
  directResultOpen: boolean;
  resultOverlayPrimeActive: boolean;
  forceOpenOverboardKind: string | null;
  ownerActiveKind: string | null;
  ownerDisplayKind: string | null;
}): void {
  const timestamp = performance.now();
  const payload = { timestamp, t: timestamp, ...data };
  console.log('LOBBY_INDICATOR_RESULT_PREFETCH_SKIPPED_DURING_RESULT_OPEN', payload);
  window.__debug98log?.(
    'LOBBY_INDICATOR_RESULT_PREFETCH_SKIPPED_DURING_RESULT_OPEN',
    payload,
  );
}
