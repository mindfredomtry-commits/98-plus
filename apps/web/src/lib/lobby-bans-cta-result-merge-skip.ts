'use client';

import type { NotificationOverlayOwnerState } from './notification-overlay-owner';
import { normalizeId } from './normalize-json';
import type { QueuedOverlay } from './overlay-queue';

export type LobbyBansCtaResultMergeSkipMatchedBy =
  | 'activeResult'
  | 'queueHead'
  | 'ownerDisplayResult'
  | 'ownerPending'
  | 'ownerQueue'
  | 'shownKey'
  | 'closingResult'
  | 'goToBansSessionTrace';

function isSameResultBanId(item: QueuedOverlay, banId: string): boolean {
  return item.kind === 'result' && normalizeId(item.result.id) === banId;
}

export function resolveLobbyBansCtaResultMergeSkip(input: {
  banId: string;
  owner: NotificationOverlayOwnerState;
  closingResultBanId: string | null;
  goToBansSessionTraceBlocked: boolean;
  legacyShownOverlayKeys: ReadonlySet<string>;
}): LobbyBansCtaResultMergeSkipMatchedBy | null {
  const banId = normalizeId(input.banId);
  if (!banId) return null;

  const { owner } = input;
  const activeBanId = normalizeId(owner.active.banId ?? '');
  const displayResultId = normalizeId(owner.display.result?.id ?? '');

  if (owner.active.kind === 'result' && activeBanId === banId) {
    return 'activeResult';
  }
  if (displayResultId === banId) {
    return 'ownerDisplayResult';
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

  return null;
}

export function logLobbyBansCtaResultMergeSkippedAlreadyActiveOrShown(data: {
  banId: string;
  resultId: string;
  source: string;
  reason: string;
  matchedBy: LobbyBansCtaResultMergeSkipMatchedBy;
  activeKind: string | null;
  queueHeadKind: string | null;
  pendingLen: number;
  queueLen: number;
  ownerActiveKind: string | null;
  ownerDisplayKind: string | null;
}): void {
  const timestamp = performance.now();
  const payload = { timestamp, t: timestamp, ...data };
  console.log('LOBBY_BANS_CTA_RESULT_MERGE_SKIPPED_ALREADY_ACTIVE_OR_SHOWN', payload);
  window.__debug98log?.(
    'LOBBY_BANS_CTA_RESULT_MERGE_SKIPPED_ALREADY_ACTIVE_OR_SHOWN',
    payload,
  );
}
