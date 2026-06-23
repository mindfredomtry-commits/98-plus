import type { BanInteraction, BanResult } from '@98plus/shared';
import { api } from './api';
import {
  logPendingRejectedBan,
  logQueueApiFetchResult,
  logQueueApiFetchStart,
  maybeLogQueueApiEmptyButDirectBanExists,
  readKnownDirectBanId,
  type ChainRejectedPendingDiagSnapshot,
  type QueueApiFetchDebugContext,
} from './queue-api-fetch-debug';
import {
  logChainPlaceholderStuckTrace,
  logChainRejectedPendingDiag,
} from './check-chain-drain-debug';

export type PendingChainPrefetch = {
  incoming: BanInteraction[];
  check: BanInteraction | null;
  result: BanResult | null;
  rejectDebug: PendingRejectDiagnostic[];
};

type PendingRejectDiagnostic = {
  banId: string;
  reason: string;
  status: string;
  hasCounterBan: boolean;
  handledAtSet: boolean;
  handledAt?: string | null;
  acked: boolean;
  tooOld: boolean;
  isOverboard: boolean;
};

function resolveRejectedPendingGuardHit(
  banId: string,
  snap: ChainRejectedPendingDiagSnapshot | undefined,
): string | null {
  if (!snap) return null;
  const norm = banId.trim();
  if (snap.dismissedIncoming.includes(norm)) return 'dismissed-incoming';
  if (snap.incomingConsumedAfterAnswer.includes(norm)) {
    return 'consumed-after-answer';
  }
  if (snap.locallyAckedIncoming.includes(norm)) return 'locally-acked';
  return null;
}

function logPendingRejectDebug(
  rejectDebug: PendingRejectDiagnostic[],
  ctx: QueueApiFetchDebugContext,
  incomingCount: number,
): void {
  const knownId = ctx.knownDirectBanId?.trim() || readKnownDirectBanId() || null;
  const snap = ctx.rejectedPendingDiag;
  const queueLenAfter = snap?.queueLenBefore ?? null;
  const pendingLenAfter = snap?.pendingLenBefore ?? null;
  for (const rej of rejectDebug) {
    const shouldLog =
      rej.banId === '872' ||
      incomingCount === 0 ||
      (knownId != null && rej.banId === knownId);
    if (!shouldLog) continue;
    logPendingRejectedBan(rej);
    logChainRejectedPendingDiag({
      banId: rej.banId,
      reason: rej.reason,
      source: ctx.source,
      endpoint: '/bans/incoming/pending-all',
      status: rej.status,
      handledAt: rej.handledAt ?? (rej.handledAtSet ? 'set' : null),
      acked: rej.acked,
      tooOld: rej.tooOld,
      hasCounterBan: rej.hasCounterBan,
      wasInPendingStartup: snap?.pendingBanIds.includes(rej.banId) ?? false,
      wasInOverlayQueue: snap?.queueBanIds.includes(rej.banId) ?? false,
      willRetry: true,
      willDrop: true,
      guardHit: resolveRejectedPendingGuardHit(rej.banId, snap),
      pendingLenBefore: snap?.pendingLenBefore ?? null,
      pendingLenAfter,
      queueLenBefore: snap?.queueLenBefore ?? null,
      queueLenAfter,
    });
    logChainPlaceholderStuckTrace({
      phase: 'pending-rejected-ban',
      source: ctx.source,
      blockReason: rej.reason,
      banId: rej.banId,
      pendingRejectStatus: rej.status,
      hasCounterBan: rej.hasCounterBan,
      handledAtSet: rej.handledAtSet,
      acked: rej.acked,
      tooOld: rej.tooOld,
      isOverboard: rej.isOverboard,
      incomingCount,
    });
  }
}

function logEndpointResult(
  endpoint: string,
  ctx: QueueApiFetchDebugContext,
  items: Array<{
    id: string;
    status?: string | null;
    kind: string;
  }>,
): void {
  logQueueApiFetchResult({
    source: ctx.source,
    endpoint,
    telegramUserId: ctx.telegramUserId ?? null,
    count: items.length,
    incomingCount: items.filter((i) => i.kind === 'incoming').length,
    checkCount: items.filter((i) => i.kind === 'check').length,
    resultCount: items.filter((i) => i.kind === 'result').length,
    banIds: items.map((i) => i.id),
    statuses: items.map((i) => i.status ?? null),
    kinds: items.map((i) => i.kind),
  });
  maybeLogQueueApiEmptyButDirectBanExists(endpoint, items.length, ctx);
}

export async function fetchPendingChainPrefetch(
  token: string,
  debug?: QueueApiFetchDebugContext,
): Promise<PendingChainPrefetch> {
  const ctx: QueueApiFetchDebugContext = {
    source: debug?.source ?? 'fetchPendingChainPrefetch',
    telegramUserId: debug?.telegramUserId ?? null,
    reason: debug?.reason ?? 'pending-chain-prefetch',
    knownDirectBanId: debug?.knownDirectBanId ?? null,
    hasLobbyBansAttentionHint: debug?.hasLobbyBansAttentionHint,
    restoreStateFound: debug?.restoreStateFound,
  };

  logQueueApiFetchStart({
    source: ctx.source,
    endpoint: '/bans/incoming/pending-all',
    telegramUserId: ctx.telegramUserId ?? null,
    reason: ctx.reason,
  });
  const incomingRes = await api<{
    bans: BanInteraction[];
    rejectDebug?: PendingRejectDiagnostic[];
  }>('/bans/incoming/pending-all', { token }).catch(() => ({
    bans: [] as BanInteraction[],
    rejectDebug: [] as PendingRejectDiagnostic[],
  }));
  const incoming = Array.isArray(incomingRes.bans) ? incomingRes.bans : [];
  const rejectDebug = Array.isArray(incomingRes.rejectDebug)
    ? incomingRes.rejectDebug
    : [];
  logPendingRejectDebug(rejectDebug, ctx, incoming.length);
  logEndpointResult(
    '/bans/incoming/pending-all',
    ctx,
    incoming.map((b) => ({
      id: b.id,
      status: b.status ?? null,
      kind: 'incoming',
    })),
  );

  logQueueApiFetchStart({
    source: ctx.source,
    endpoint: '/bans/check/pending',
    telegramUserId: ctx.telegramUserId ?? null,
    reason: ctx.reason,
  });
  const checkRes = await api<{ ban: BanInteraction | null }>(
    '/bans/check/pending',
    { token },
  ).catch(() => ({ ban: null as BanInteraction | null }));
  const check = checkRes.ban ?? null;
  logEndpointResult(
    '/bans/check/pending',
    ctx,
    check
      ? [{ id: check.id, status: check.status ?? null, kind: 'check' }]
      : [],
  );

  logQueueApiFetchStart({
    source: ctx.source,
    endpoint: '/bans/result/pending',
    telegramUserId: ctx.telegramUserId ?? null,
    reason: ctx.reason,
  });
  const resultRes = await api<{ result: BanResult | null }>(
    '/bans/result/pending',
    { token },
  ).catch(() => ({ result: null as BanResult | null }));
  const result = resultRes.result ?? null;
  logEndpointResult(
    '/bans/result/pending',
    ctx,
    result ? [{ id: result.id, status: result.status ?? null, kind: 'result' }] : [],
  );

  return { incoming, check, result, rejectDebug };
}
