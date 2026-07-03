'use client';

import { isExplicitNotificationDrainSource } from './notification-chain-explicit-drain';
import { normalizeId } from './normalize-json';
import type { QueuedOverlay } from './overlay-queue';
import { overlayQueueKey } from './overlay-queue';

const EXPLICIT_RESULT_OPEN_MARKERS = [
  'replaceIncomingWithOverboardResultAtomic',
  'openIncomingOverboardOptimistic',
  'forceOpenOverboardResult',
  'overboard-action',
  'incoming-overboard-atomic',
  'incoming-overboard-result',
  'check-answer-final',
  'showCheckAnswerFinalResult',
  'openBanResult:explicit',
  'openBanResult:live',
  'overboard-status-direct',
  'bot-deeplink',
  'deeplink-direct',
  'applyCheckDeeplink',
  'applyIncoming',
  'openDeepLink',
] as const;

const PASSIVE_RESULT_OPEN_MARKERS = [
  'result-overlay-prime',
  'lobby-indicator-prime',
  'status-cta-prefetch',
  'useIncomingPoll',
  'reloadPending',
  'pollPendingResultOnce',
  'receiveResult',
  'openBanResult:auto',
  'enqueue-pending:poll',
  'enqueue-pending:session',
  'result-poll-pending-only',
  'result-poll-deferred',
  'prefetchPendingNotificationChain',
  'pending-chain-prefetch',
  'apply-session',
  'auth-ready-layout',
  'startup-release',
  'mergeStartupIntoOverlayQueueOnly',
  'enqueueNotification',
] as const;

export type PassiveResultOverlayGateContext = {
  lobbyOpen: boolean;
  bansReturnToLobbyLatch?: boolean;
  freshOverboardAction: boolean;
  atomicOverboardHold: boolean;
  chainAdvanceExplicit: boolean;
  notificationChainAwaitingUser: boolean;
  resultAlreadyMountedForBan: boolean;
  directOverboardInFlight: boolean;
  interactiveResultBan: boolean;
};

export function isExplicitResultOpenSource(source: string): boolean {
  if (isExplicitNotificationDrainSource(source)) return true;
  return EXPLICIT_RESULT_OPEN_MARKERS.some((marker) => source.includes(marker));
}

export function isPassiveResultOpenSource(source: string): boolean {
  if (isExplicitResultOpenSource(source)) return false;
  return PASSIVE_RESULT_OPEN_MARKERS.some((marker) => source.includes(marker));
}

export function isPassiveResultLookaheadSource(source: string): boolean {
  return source.includes('result-overlay-prime');
}

/** Lobby idle surface: user on lobby without an active notification-chain card. */
export function isPassiveLobbyIdleSurface(
  ctx: PassiveResultOverlayGateContext,
): boolean {
  if (ctx.notificationChainAwaitingUser) return false;
  return Boolean(ctx.lobbyOpen || ctx.bansReturnToLobbyLatch);
}

export function isInteractiveOverboardResultContext(
  ctx: PassiveResultOverlayGateContext,
): boolean {
  return (
    ctx.interactiveResultBan ||
    ctx.freshOverboardAction ||
    ctx.atomicOverboardHold ||
    ctx.directOverboardInFlight ||
    (ctx.notificationChainAwaitingUser &&
      (ctx.resultAlreadyMountedForBan || ctx.interactiveResultBan))
  );
}

/** Passive lobby prime/lookahead must not mount result overlay over lobby. */
export function shouldBlockPassiveResultOverlayOpen(
  source: string,
  ctx: PassiveResultOverlayGateContext,
): boolean {
  if (isExplicitResultOpenSource(source)) return false;
  if (isInteractiveOverboardResultContext(ctx)) return false;
  if (ctx.chainAdvanceExplicit && !isPassiveLobbyIdleSurface(ctx)) return false;
  if (ctx.resultAlreadyMountedForBan && ctx.notificationChainAwaitingUser) {
    return false;
  }
  if (!isPassiveLobbyIdleSurface(ctx)) return false;
  return true;
}

/** Block passive prime/sync from creating result display on lobby idle. */
export function shouldBlockPassiveResultLookaheadDisplay(
  source: string,
  ctx: PassiveResultOverlayGateContext,
): boolean {
  if (isExplicitResultOpenSource(source)) return false;
  if (isInteractiveOverboardResultContext(ctx)) return false;
  if (!isPassiveLobbyIdleSurface(ctx)) return false;
  if (source.includes('result-overlay-prime')) return true;
  if (
    source === 'syncDisplayFromQueue' ||
    source.startsWith('syncDisplayFromQueue')
  ) {
    return true;
  }
  if (isPassiveResultLookaheadSource(source)) return true;
  return shouldBlockPassiveResultOverlayOpen(source, ctx);
}

/** Suppress result shell from queue head / held overlay on passive lobby idle. */
export function shouldBlockPassiveResultShellDisplay(
  ctx: PassiveResultOverlayGateContext,
): boolean {
  if (isInteractiveOverboardResultContext(ctx)) return false;
  return isPassiveLobbyIdleSurface(ctx);
}

export function logPassiveResultOverlayBlocked(data: {
  source: string;
  banId: string | null;
  phase: string;
  passiveSource: boolean;
  lobbyOpen: boolean;
}): void {
  const payload = { t: performance.now(), ...data };
  console.log('[PASSIVE RESULT OVERLAY BLOCKED]', payload);
  window.__debug98log?.('[PASSIVE RESULT OVERLAY BLOCKED]', payload);
}

export function logPassiveResultLookaheadBlocked(data: {
  source: string;
  banId: string | null;
  lobbyOpen: boolean;
  activeDrain: boolean;
  activeKind: string | null;
}): void {
  const payload = { t: performance.now(), ...data };
  console.log('[PASSIVE RESULT LOOKAHEAD BLOCKED]', payload);
  window.__debug98log?.('[PASSIVE RESULT LOOKAHEAD BLOCKED]', payload);
}

export function isPassiveResultPrefetchSource(source: string): boolean {
  return (
    source.includes('lobby-indicator-prime') ||
    source.includes('result-overlay-prime') ||
    source.includes('prefetch-pending-chain-enqueue') ||
    source.includes('passive-result-deferred')
  );
}

export type ClosedResultTombstone = {
  banId: string;
  resultKey: string;
  kind: 'result' | 'status';
  sessionId: string | null;
};

const closedResultTombstonesByKey = new Map<string, ClosedResultTombstone>();

export function recordClosedResultTombstone(input: {
  banId: string;
  resultKey?: string | null;
  kind?: 'result' | 'status';
  sessionId?: string | null;
}): void {
  const banId = normalizeId(input.banId);
  if (!banId) return;
  const resultKey = normalizeId(input.resultKey ?? banId) || banId;
  const tombstone: ClosedResultTombstone = {
    banId,
    resultKey,
    kind: input.kind ?? 'result',
    sessionId: input.sessionId ?? null,
  };
  closedResultTombstonesByKey.set(banId, tombstone);
  closedResultTombstonesByKey.set(`result:${banId}`, tombstone);
  if (resultKey !== banId) {
    closedResultTombstonesByKey.set(resultKey, tombstone);
    closedResultTombstonesByKey.set(`result:${resultKey}`, tombstone);
  }
}

export function hasClosedResultTombstone(
  banIdOrKey: string | null | undefined,
): boolean {
  const key = normalizeId(banIdOrKey ?? '');
  if (!key) return false;
  return (
    closedResultTombstonesByKey.has(key) ||
    closedResultTombstonesByKey.has(`result:${key}`)
  );
}

export function clearClosedResultTombstones(): void {
  closedResultTombstonesByKey.clear();
}

/** Passive/prefetch enqueue paths that must not revive a go-to-bans closed result. */
export function isPassiveClosedResultEnqueueSource(source: string): boolean {
  if (isExplicitResultOpenSource(source)) return false;
  return (
    isPassiveResultPrefetchSource(source) ||
    isPassiveResultOpenSource(source) ||
    source.includes('status-cta-prefetch') ||
    source.includes('defer-pending-startup') ||
    source.includes('defer-notification') ||
    source.includes('applyPendingQueueViaOwner') ||
    source.includes('mergeStartup') ||
    source.includes('merge-startup') ||
    source.includes('openBanResult:auto') ||
    source.includes('passive-result-blocked') ||
    source.includes('receiveResult')
  );
}

export function shouldBlockPassiveClosedResultEnqueue(
  source: string,
  banIdOrKey: string | null | undefined,
): boolean {
  if (!hasClosedResultTombstone(banIdOrKey)) return false;
  if (isExplicitResultOpenSource(source)) return false;
  return isPassiveClosedResultEnqueueSource(source);
}

export function filterPendingForClosedResultTombstone(
  source: string,
  pending: readonly QueuedOverlay[],
): QueuedOverlay[] {
  if (isExplicitResultOpenSource(source)) return [...pending];
  if (!isPassiveClosedResultEnqueueSource(source)) return [...pending];
  return pending.filter((item) => {
    if (item.kind !== 'result') return true;
    return !hasClosedResultTombstone(item.result.id);
  });
}

export function resolveGoToBansClosedResultPassivePrefetchBlockReason(
  source: string,
  banId: string,
  markers: {
    ownerShownOverlayHasResult: boolean;
    goToBansSessionTraceMatches: boolean;
    goToBansClosingBanId: boolean;
  },
): string | null {
  if (!banId) return null;
  if (shouldBlockPassiveClosedResultEnqueue(source, banId)) {
    return 'closed-result-tombstone';
  }
  if (!isPassiveResultPrefetchSource(source)) return null;
  if (markers.goToBansSessionTraceMatches) return 'go-to-bans-session-trace';
  if (markers.goToBansClosingBanId) return 'result-go-to-bans-closing';
  if (markers.ownerShownOverlayHasResult) return 'owner-shown-overlay-key';
  return null;
}

export function logGoToBansClosedResultPrefetchBlock(data: {
  source: string;
  banId: string;
  resultId: string;
  freshFinalStatus: boolean;
  ownerShownOverlayHasResult: boolean;
  resultCtaConsumedHasBanId: boolean;
  resultDeliveredHasBanId: boolean;
  reason: string;
  stage: string;
  sessionId: string | null;
  closedSessionId?: string | null;
}): void {
  const timestamp = performance.now();
  const payload = { timestamp, t: timestamp, ...data };
  console.log('GO_TO_BANS_CLOSED_RESULT_PREFETCH_BLOCK', payload);
  window.__debug98log?.('GO_TO_BANS_CLOSED_RESULT_PREFETCH_BLOCK', payload);
}

export function isSamePendingOverlaySnapshot(
  left: readonly QueuedOverlay[],
  right: readonly QueuedOverlay[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every(
    (item, index) => overlayQueueKey(item) === overlayQueueKey(right[index]!),
  );
}

export function filterPendingForGoToBansClosedPassivePrefetch(input: {
  source: string;
  pending: QueuedOverlay[];
  stage: string;
  sessionId: string | null;
  closedSessionId: string | null;
  freshFinalStatusFor: (banId: string) => boolean;
  consumedFor: (banId: string) => boolean;
  deliveredFor: (banId: string) => boolean;
  ownerShownOverlayHasResultFor: (banId: string) => boolean;
  goToBansSessionTraceMatchesFor: (banId: string) => boolean;
  goToBansClosingBanIdFor: (banId: string) => boolean;
}): QueuedOverlay[] {
  const passive =
    isPassiveResultPrefetchSource(input.source) ||
    isPassiveClosedResultEnqueueSource(input.source);
  if (!passive) {
    return input.pending;
  }
  const filtered: QueuedOverlay[] = [];
  for (const item of input.pending) {
    if (item.kind !== 'result') {
      filtered.push(item);
      continue;
    }
    const banId = normalizeId(item.result.id);
    const blockReason = resolveGoToBansClosedResultPassivePrefetchBlockReason(
      input.source,
      banId,
      {
        ownerShownOverlayHasResult: input.ownerShownOverlayHasResultFor(banId),
        goToBansSessionTraceMatches: input.goToBansSessionTraceMatchesFor(banId),
        goToBansClosingBanId: input.goToBansClosingBanIdFor(banId),
      },
    );
    if (blockReason) {
      logGoToBansClosedResultPrefetchBlock({
        source: input.source,
        banId,
        resultId: banId,
        freshFinalStatus: input.freshFinalStatusFor(banId),
        ownerShownOverlayHasResult: input.ownerShownOverlayHasResultFor(banId),
        resultCtaConsumedHasBanId: input.consumedFor(banId),
        resultDeliveredHasBanId: input.deliveredFor(banId),
        reason: blockReason,
        stage: input.stage,
        sessionId: input.sessionId,
        closedSessionId: input.closedSessionId,
      });
      continue;
    }
    filtered.push(item);
  }
  return filtered;
}

export function resolveGoToBansPassivePrefetchResultSkipReason(
  source: string,
  banId: string,
  markers: {
    ownerShownOverlayHasResult: boolean;
    resultCtaConsumed: boolean;
    resultDelivered: boolean;
  },
): string | null {
  if (!banId) return null;
  if (shouldBlockPassiveClosedResultEnqueue(source, banId)) {
    return 'closed-result-tombstone';
  }
  const isPassivePrimeSource =
    source.includes('lobby-indicator-prime') ||
    source.includes('result-overlay-prime');
  if (!isPassivePrimeSource) return null;
  if (markers.ownerShownOverlayHasResult) return 'owner-shown-overlay-key';
  if (markers.resultCtaConsumed) return 'result-cta-consumed';
  if (markers.resultDelivered) return 'result-delivered';
  return null;
}

export type GoToBansClosedResultMarkers = {
  ownerShownOverlayHasResult: boolean;
  resultCtaConsumed: boolean;
  resultDelivered: boolean;
  goToBansClosingBanId: boolean;
  goToBansSessionTraceMatches: boolean;
};

export function resolveGoToBansClosedResultMarkerReason(
  banId: string,
  markers: GoToBansClosedResultMarkers,
): string | null {
  if (!banId) return null;
  if (hasClosedResultTombstone(banId)) return 'closed-result-tombstone';
  if (markers.goToBansSessionTraceMatches) return 'go-to-bans-session-trace';
  if (markers.goToBansClosingBanId) return 'result-go-to-bans-closing';
  if (markers.ownerShownOverlayHasResult) return 'owner-shown-overlay-key';
  if (markers.resultCtaConsumed) return 'result-cta-consumed';
  if (markers.resultDelivered) return 'result-delivered';
  return null;
}

export function resolveGoToBansPassivePendingResultSkipReason(
  source: string,
  banId: string,
  markers: GoToBansClosedResultMarkers,
): string | null {
  if (!banId) return null;
  if (shouldBlockPassiveClosedResultEnqueue(source, banId)) {
    return 'closed-result-tombstone';
  }
  if (!source.includes('lobby-indicator-prime')) return null;
  return resolveGoToBansClosedResultMarkerReason(banId, markers);
}

export function logGoToBansPassivePrefetchResultSkip(data: {
  source: string;
  banId: string;
  reason: string;
}): void {
  const timestamp = performance.now();
  const payload = { timestamp, t: timestamp, ...data };
  console.log('GO_TO_BANS_PASSIVE_PREFETCH_RESULT_SKIP', payload);
  window.__debug98log?.('GO_TO_BANS_PASSIVE_PREFETCH_RESULT_SKIP', payload);
}

export function logGoToBansPassivePendingResultSkip(data: {
  source: string;
  banId: string;
  resultId: string;
  reason: string;
}): void {
  const timestamp = performance.now();
  const payload = { timestamp, t: timestamp, ...data };
  console.log('GO_TO_BANS_PASSIVE_PENDING_RESULT_SKIP', payload);
  window.__debug98log?.('GO_TO_BANS_PASSIVE_PENDING_RESULT_SKIP', payload);
}
