'use client';

import { logPlatformQueueFlowTrace } from '@/lib/platform-queue-flow-trace-debug';
import type { NotificationOverlayOwnerState } from '@/notification-owner/notification-owner-pin-state';
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

export function filterLobbyBansCtaMergeSnapshot(
  snapshot: QueuedOverlay[],
  input: {
    source: string;
    owner: NotificationOverlayOwnerState;
    ownerDisplayKind: string | null;
    closingResultBanId: string | null;
    goToBansSessionTraceBlockedForBan: (banId: string) => boolean;
    legacyShownOverlayKeys: ReadonlySet<string>;
  },
): QueuedOverlay[] {
  const filtered: QueuedOverlay[] = [];
  for (const item of snapshot) {
    if (item.kind !== 'result') {
      filtered.push(item);
      continue;
    }
    const banId = normalizeId(item.result.id);
    if (!banId) continue;
    const matchedBy = resolveLobbyBansCtaResultMergeSkip({
      banId,
      owner: input.owner,
      closingResultBanId: input.closingResultBanId,
      goToBansSessionTraceBlocked:
        input.goToBansSessionTraceBlockedForBan(banId),
      legacyShownOverlayKeys: input.legacyShownOverlayKeys,
    });
    if (matchedBy) {
      const queueHead = input.owner.queue[0] ?? null;
      logPlatformQueueFlowTrace({
        source: input.source,
        phase: 'merge-snapshot-result-skipped',
        owner: input.owner,
        branch: matchedBy,
        mergedCount: 0,
      });
      logLobbyBansCtaResultMergeSkippedAlreadyActiveOrShown({
        banId,
        resultId: banId,
        source: input.source,
        reason: `lobby-bans-cta-result-merge-skip-${matchedBy}`,
        matchedBy,
        activeKind: input.owner.active.kind,
        queueHeadKind: queueHead?.kind ?? null,
        pendingLen: input.owner.pending.length,
        queueLen: input.owner.queue.length,
        ownerActiveKind: input.owner.active.kind,
        ownerDisplayKind: input.ownerDisplayKind,
      });
      continue;
    }
    filtered.push(item);
  }
  return filtered;
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
