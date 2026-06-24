'use client';

import {
  noteConnectionFetchStart,
  patchConnectionFetchOutcome,
} from '@/lib/connection-state-debug';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

let lastKnownDirectBanId: string | null = null;

export function noteKnownDirectBanId(banId: string | null | undefined): void {
  const norm = banId?.trim() ?? '';
  lastKnownDirectBanId = norm || null;
}

export function readKnownDirectBanId(): string | null {
  return lastKnownDirectBanId;
}

export type QueueApiFetchDebugContext = {
  source: string;
  telegramUserId?: string | null;
  reason?: string;
  knownDirectBanId?: string | null;
  hasLobbyBansAttentionHint?: boolean;
  restoreStateFound?: boolean;
  /** Snapshot for [CHAIN REJECTED PENDING DIAG] — queue/guard state at fetch time. */
  rejectedPendingDiag?: ChainRejectedPendingDiagSnapshot;
};

export type ChainRejectedPendingDiagSnapshot = {
  queueLenBefore: number;
  pendingLenBefore: number;
  queueBanIds: string[];
  pendingBanIds: string[];
  dismissedIncoming: string[];
  locallyAckedIncoming: string[];
  incomingConsumedAfterAnswer: string[];
};

export function logQueueApiFetchStart(data: {
  source: string;
  endpoint: string;
  telegramUserId: string | null;
  reason?: string;
}): void {
  noteConnectionFetchStart({
    endpoint: data.endpoint,
    source: `${data.source}${data.reason ? `:${data.reason}` : ''}`,
  });
  emit('[QUEUE API FETCH START]', data);
}

export function logQueueApiFetchResult(data: {
  source: string;
  endpoint: string;
  telegramUserId: string | null;
  count: number;
  incomingCount?: number;
  checkCount?: number;
  resultCount?: number;
  banIds: string[];
  statuses: (string | null)[];
  kinds: string[];
}): void {
  patchConnectionFetchOutcome({
    endpoint: data.endpoint,
    ok: true,
    status: 'ok',
    source: data.source,
  });
  emit('[QUEUE API FETCH RESULT]', data);
}

export function logQueueApiFetchEmptyButDirectBanExists(data: {
  source: string;
  telegramUserId: string | null;
  endpoint: string;
  knownDirectBanId: string | null;
  hasLobbyBansAttentionHint: boolean;
  restoreStateFound: boolean;
  reason: string;
}): void {
  emit('[QUEUE API FETCH EMPTY BUT DIRECT BAN EXISTS]', data);
}

export function maybeLogQueueApiEmptyButDirectBanExists(
  endpoint: string,
  count: number,
  ctx: QueueApiFetchDebugContext,
): void {
  if (count > 0) return;
  const knownDirectBanId =
    ctx.knownDirectBanId?.trim() || readKnownDirectBanId() || null;
  const hasHint = ctx.hasLobbyBansAttentionHint === true;
  const hasRestore = ctx.restoreStateFound === true;
  if (!knownDirectBanId && !hasHint && !hasRestore) return;

  logQueueApiFetchEmptyButDirectBanExists({
    source: ctx.source,
    telegramUserId: ctx.telegramUserId ?? null,
    endpoint,
    knownDirectBanId,
    hasLobbyBansAttentionHint: hasHint,
    restoreStateFound: hasRestore,
    reason: 'pending-endpoint-empty-with-hint-or-known-direct-ban',
  });
}

export type PendingRejectBanClientLog = {
  banId: string;
  reason: string;
  status: string;
  hasCounterBan: boolean;
  handledAtSet: boolean;
  acked: boolean;
  tooOld: boolean;
  isOverboard: boolean;
};

export function logPendingRejectedBan(entry: PendingRejectBanClientLog): void {
  const event =
    entry.banId === '872'
      ? '[PENDING REJECTED BAN 872]'
      : '[PENDING REJECTED BAN]';
  emit(event, {
    reason: entry.reason,
    status: entry.status,
    hasCounterBan: entry.hasCounterBan,
    handledAtSet: entry.handledAtSet,
    acked: entry.acked,
    tooOld: entry.tooOld,
    isOverboard: entry.isOverboard,
    banId: entry.banId,
  });
}
