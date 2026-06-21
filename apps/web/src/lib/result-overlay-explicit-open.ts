'use client';

import { isExplicitNotificationDrainSource } from './notification-chain-explicit-drain';

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
  return (
    source.includes('result-overlay-prime') ||
    source === 'syncDisplayFromQueue' ||
    source.startsWith('syncDisplayFromQueue:')
  );
}

function isOnLobbySurface(ctx: PassiveResultOverlayGateContext): boolean {
  return Boolean(ctx.lobbyOpen || ctx.bansReturnToLobbyLatch);
}

/** Passive lobby prime/lookahead must not mount result overlay over lobby. */
export function shouldBlockPassiveResultOverlayOpen(
  source: string,
  ctx: PassiveResultOverlayGateContext,
): boolean {
  if (isExplicitResultOpenSource(source)) return false;
  if (ctx.atomicOverboardHold) return false;
  if (ctx.directOverboardInFlight) return false;
  if (ctx.chainAdvanceExplicit && !isOnLobbySurface(ctx)) return false;
  if (ctx.resultAlreadyMountedForBan && ctx.notificationChainAwaitingUser) {
    return false;
  }
  if (!isOnLobbySurface(ctx)) return false;
  return true;
}

/** Block result-overlay-prime / sync queue-head from creating result display on lobby. */
export function shouldBlockPassiveResultLookaheadDisplay(
  source: string,
  ctx: PassiveResultOverlayGateContext,
): boolean {
  if (isExplicitResultOpenSource(source)) return false;
  if (ctx.atomicOverboardHold) return false;
  if (ctx.directOverboardInFlight) return false;
  if (!isOnLobbySurface(ctx)) return false;
  if (isPassiveResultLookaheadSource(source)) return true;
  return shouldBlockPassiveResultOverlayOpen(source, ctx);
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
