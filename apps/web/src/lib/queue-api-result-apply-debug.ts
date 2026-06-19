'use client';

import { isLobbyIndicatorPrefetchSource } from './lobby-bans-indicator-debug';
import { isPostSuccessHandoffInProgress } from './post-success-handoff-debug';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function classifyApplySourceFlags(source: string): {
  isIndicatorPrime: boolean;
  isExplicitDrain: boolean;
  isSuccessExit: boolean;
  isLobbyBans: boolean;
} {
  return {
    isIndicatorPrime:
      isLobbyIndicatorPrefetchSource(source) ||
      source.startsWith('lobby-indicator-prime'),
    isExplicitDrain:
      source.includes('success-exit') ||
      source.includes('lobby-bans') ||
      source.includes('drainNextNotificationAfterSuccess'),
    isSuccessExit: source.includes('success-exit'),
    isLobbyBans: source.includes('lobby-bans'),
  };
}

export function logQueueApiResultApplyDecision(data: {
  source: string;
  endpoint: string;
  count: number;
  banIds: string[];
  willMergeToOverlayQueue: boolean;
  willMergeToPendingStartup: boolean;
  willOnlyPrimeIndicator: boolean;
  skipReason: string | null;
  queueLenBefore: number;
  pendingLenBefore: number;
  queueLenAfter: number;
  pendingLenAfter: number;
  enqueuedIds?: string[];
  toEnqueueLen?: number;
}): void {
  emit('[QUEUE API RESULT APPLY DECISION]', data);
}

export function logIncomingPendingAllMergeSkipped(data: {
  source: string;
  banIds: string[];
  reason: string;
  isIndicatorPrime: boolean;
  isExplicitDrain: boolean;
  isSuccessExit: boolean;
  isLobbyBans: boolean;
  hasPostSuccessHandoff: boolean;
  notificationChainTransitioning: boolean;
  skipDetails?: Array<{ banId: string; reason: string }>;
}): void {
  emit('[INCOMING PENDING ALL MERGE SKIPPED]', data);
}

export function logLobbyBansPendingFetchMissing(data: {
  reason: string;
  queueLen?: number;
  pendingLen?: number;
  hasLobbyBansAttentionHint?: boolean;
  needAttention?: boolean;
}): void {
  emit('[LOBBY BANS PENDING FETCH MISSING]', data);
}

export function logPendingStartupToOverlayMergeDecision(data: {
  source: string;
  pendingLenBefore: number;
  queueLenBefore: number;
  mergedCount: number;
  queueLenAfter: number;
  pendingLenAfter: number;
  skipReason: string | null;
  startupHold: boolean;
}): void {
  emit('[QUEUE API RESULT APPLY DECISION]', {
    ...data,
    endpoint: 'pendingStartup→overlayQueue',
    count: data.pendingLenBefore,
    banIds: [],
    willMergeToOverlayQueue: data.mergedCount > 0,
    willMergeToPendingStartup: false,
    willOnlyPrimeIndicator: false,
  });
}

export function buildMergeSkippedFlags(
  source: string,
  notificationChainTransitioning: boolean,
): {
  isIndicatorPrime: boolean;
  isExplicitDrain: boolean;
  isSuccessExit: boolean;
  isLobbyBans: boolean;
  hasPostSuccessHandoff: boolean;
  notificationChainTransitioning: boolean;
} {
  const flags = classifyApplySourceFlags(source);
  return {
    ...flags,
    hasPostSuccessHandoff: isPostSuccessHandoffInProgress(),
    notificationChainTransitioning,
  };
}
