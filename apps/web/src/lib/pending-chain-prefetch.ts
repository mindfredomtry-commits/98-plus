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
import {
  logCheckNotificationFetchTrace,
  normalizeCheckNotificationTraceSource,
} from './check-notification-fetch-trace-debug';

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

function logFirstUserPendingFetchTrace(input: {
  telegramUserId: string | null;
  endpoint: string;
  incomingCount: number;
  checkCount: number;
  resultCount: number;
  pendingAllCount: number;
  itemsKinds: string[];
  itemsBanIds: string[];
  itemsResultIds: string[];
  source?: string;
}): void {
  console.log('FIRST_USER_PENDING_FETCH_TRACE', input);
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
  logQueueApiFetchStart({
    source: ctx.source,
    endpoint: '/bans/check/pending',
    telegramUserId: ctx.telegramUserId ?? null,
    reason: ctx.reason,
  });
  logQueueApiFetchStart({
    source: ctx.source,
    endpoint: '/bans/result/pending',
    telegramUserId: ctx.telegramUserId ?? null,
    reason: ctx.reason,
  });

  const [incomingRes, checkRes, resultRes] = await Promise.all([
    api<{
      bans: BanInteraction[];
      rejectDebug?: PendingRejectDiagnostic[];
    }>('/bans/incoming/pending-all', { token }).catch(() => ({
      bans: [] as BanInteraction[],
      rejectDebug: [] as PendingRejectDiagnostic[],
    })),
    api<{ ban: BanInteraction | null }>('/bans/check/pending', { token }).catch(
      () => ({ ban: null as BanInteraction | null }),
    ),
    api<{ result: BanResult | null }>('/bans/result/pending', { token }).catch(
      () => ({ result: null as BanResult | null }),
    ),
  ]);

  const incoming = Array.isArray(incomingRes.bans) ? incomingRes.bans : [];
  const rejectDebug = Array.isArray(incomingRes.rejectDebug)
    ? incomingRes.rejectDebug
    : [];
  logFirstUserPendingFetchTrace({
    telegramUserId: ctx.telegramUserId ?? null,
    endpoint: '/bans/incoming/pending-all',
    incomingCount: incoming.length,
    checkCount: 0,
    resultCount: 0,
    pendingAllCount: incoming.length,
    itemsKinds: incoming.map(() => 'incoming'),
    itemsBanIds: incoming.map((b) => b.id),
    itemsResultIds: [],
    source: ctx.source,
  });
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

  const check = checkRes.ban ?? null;
  logFirstUserPendingFetchTrace({
    telegramUserId: ctx.telegramUserId ?? null,
    endpoint: '/bans/check/pending',
    incomingCount: 0,
    checkCount: check ? 1 : 0,
    resultCount: 0,
    pendingAllCount: check ? 1 : 0,
    itemsKinds: check ? ['check'] : [],
    itemsBanIds: check ? [check.id] : [],
    itemsResultIds: [],
    source: ctx.source,
  });
  logEndpointResult(
    '/bans/check/pending',
    ctx,
    check
      ? [{ id: check.id, status: check.status ?? null, kind: 'check' }]
      : [],
  );

  const result = resultRes.result ?? null;
  logFirstUserPendingFetchTrace({
    telegramUserId: ctx.telegramUserId ?? null,
    endpoint: '/bans/result/pending',
    incomingCount: 0,
    checkCount: 0,
    resultCount: result ? 1 : 0,
    pendingAllCount: result ? 1 : 0,
    itemsKinds: result ? ['result'] : [],
    itemsBanIds: result ? [result.id] : [],
    itemsResultIds: result ? [result.id] : [],
    source: ctx.source,
  });
  logEndpointResult(
    '/bans/result/pending',
    ctx,
    result ? [{ id: result.id, status: result.status ?? null, kind: 'result' }] : [],
  );

  logFirstUserPendingFetchTrace({
    telegramUserId: ctx.telegramUserId ?? null,
    endpoint: 'pending-chain-prefetch-combined',
    incomingCount: incoming.length,
    checkCount: check ? 1 : 0,
    resultCount: result ? 1 : 0,
    pendingAllCount:
      incoming.length + (check ? 1 : 0) + (result ? 1 : 0),
    itemsKinds: [
      ...incoming.map(() => 'incoming' as const),
      ...(check ? (['check'] as const) : []),
      ...(result ? (['result'] as const) : []),
    ],
    itemsBanIds: [
      ...incoming.map((b) => b.id),
      ...(check ? [check.id] : []),
      ...(result ? [result.id] : []),
    ],
    itemsResultIds: result ? [result.id] : [],
    source: ctx.source,
  });

  logCheckNotificationFetchTrace({
    source: normalizeCheckNotificationTraceSource(ctx.source),
    telegramUserId: ctx.telegramUserId ?? null,
    incomingCount: incoming.length,
    checkCount: check ? 1 : 0,
    resultCount: result ? 1 : 0,
    hasCheck: Boolean(check?.id),
    hasPendingNotificationChain: false,
    ownerQueueLen: 0,
    ownerPendingLen: 0,
    legacyQueueLen: 0,
    legacyPendingLen: 0,
    indicatorVisible: false,
    skipReason: 'api-layer-fetch-only-owner-snapshot-in-providers',
    endpoint:
      '/bans/incoming/pending-all,/bans/check/pending,/bans/result/pending',
  });

  return { incoming, check, result, rejectDebug };
}
