'use client';

import {
  getPostSuccessHandoffTraceId,
  isPostSuccessHandoffInProgress,
} from '@/lib/post-success-handoff-debug';
import { isSuccessExitInstrumentationActive } from '@/lib/success-exit-first-notification-debug';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

let lastBansIndicatorReason: string | null = null;
const lastNotificationSources: string[] = [];
const MAX_NOTIFICATION_SOURCES = 12;

export function noteLastBansIndicatorReason(source: string): void {
  lastBansIndicatorReason = source;
}

export function noteNotificationEnqueueSource(source: string | null | undefined): void {
  const norm = source?.trim() ?? '';
  if (!norm) return;
  lastNotificationSources.push(norm);
  if (lastNotificationSources.length > MAX_NOTIFICATION_SOURCES) {
    lastNotificationSources.shift();
  }
}

export type PostSuccessQueueSnapshotFields = {
  source: string;
  traceId: number;
  telegramUserId: string | null;
  queueLen: number;
  pendingLen: number;
  bufferedIncomingLen: number;
  incomingLen: number;
  checkLen: number;
  resultLen: number;
  startupLen: number;
  selectedKind: string | null;
  selectedBanId: string | null;
  heldNextKind: string | null;
  hasPendingNotificationChain: boolean;
  shouldBlockNonExplicitDrain: boolean;
  isPostSuccessHandoffInProgress: boolean;
  successExitInstrumentationActive: boolean;
  bufferedIncomingId?: string | null;
};

export type PostSuccessReleaseStartupResultFields = {
  source: string;
  traceId: number;
  beforeQueueLen: number;
  beforePendingLen: number;
  afterQueueLen: number;
  afterPendingLen: number;
  movedCount: number;
  bufferedCount: number;
  selectedKind: string | null;
  selectedBanId: string | null;
  reason: string;
};

export type PostSuccessEmptyQueueIndicatorFields = {
  source: string;
  traceId: number;
  telegramUserId: string | null;
  hasLobbyIndicator: boolean;
  pendingStartupInteractions: {
    len: number;
    kinds: string[];
  };
  lastBansIndicatorReason: string | null;
  lastNotificationSources: string[];
  restoreFlags: {
    sessionBootstrapped: boolean;
    startupInteractionsHold: boolean;
    persistedAttentionHint: number;
    lobbyBansAttentionHint: number;
    lastSessionIncomingId: string | null;
    bufferedIncomingId: string | null;
    heldNextKind: string | null;
    hasPendingNotificationChain: boolean;
  };
};

export type LobbyBansQueueStartSnapshotFields = {
  telegramUserId: string | null;
  queueLenBefore: number;
  pendingLenBefore: number;
  queueLenAfter: number;
  pendingLenAfter: number;
  incomingLen: number;
  checkLen: number;
  resultLen: number;
  selectedKind: string | null;
  selectedBanId: string | null;
  source: string;
};

export function logPostSuccessQueueSnapshotBeforeRelease(
  data: PostSuccessQueueSnapshotFields,
): void {
  emit('[POST SUCCESS QUEUE SNAPSHOT BEFORE RELEASE]', data);
}

export function logPostSuccessReleaseStartupResult(
  data: PostSuccessReleaseStartupResultFields,
): void {
  emit('[POST SUCCESS RELEASE STARTUP RESULT]', data);
}

export function logPostSuccessEmptyQueueButUserHasBansIndicator(
  data: PostSuccessEmptyQueueIndicatorFields,
): void {
  emit('[POST SUCCESS EMPTY QUEUE BUT USER HAS BANS INDICATOR]', data);
}

export function logLobbyBansQueueStartSnapshot(
  data: LobbyBansQueueStartSnapshotFields,
): void {
  emit('[LOBBY BANS QUEUE START SNAPSHOT]', data);
}

export function buildPostSuccessQueueSnapshotBase(
  data: Omit<
    PostSuccessQueueSnapshotFields,
    'traceId' | 'isPostSuccessHandoffInProgress' | 'successExitInstrumentationActive'
  >,
): PostSuccessQueueSnapshotFields {
  return {
    ...data,
    traceId: getPostSuccessHandoffTraceId(),
    isPostSuccessHandoffInProgress: isPostSuccessHandoffInProgress(),
    successExitInstrumentationActive: isSuccessExitInstrumentationActive(),
  };
}

export function readLastBansIndicatorReason(): string | null {
  return lastBansIndicatorReason;
}

export function readLastNotificationSources(): string[] {
  return [...lastNotificationSources];
}
