'use client';

import { normalizeId } from '@/lib/normalize-json';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

type IncomingMountSession = {
  banId: string;
  mountedAt: number;
  source: string;
  queueLen: number;
  pendingLen: number;
  heldKind: string | null;
  heldBanId: string | null;
  advanceCallCount: number;
};

let lastIncomingMountSession: IncomingMountSession | null = null;

export type PostIncomingAdvancePayload = {
  source: string;
  reason: string;
  pipeline: string;
  activeKind: string | null;
  activeBanId: string | null;
  queueLen: number;
  pendingLen: number;
  currentIncomingBanId: string | null;
  requestedNextKind: string | null;
  requestedNextBanId: string | null;
  notificationChainTransitioning: boolean;
  chainAdvanceWaiting: boolean;
  displayKind?: string | null;
  heldKind?: string | null;
  heldBanId?: string | null;
};

export function logIncomingMountOwnerDiag(data: {
  banId: string;
  queueLen: number;
  pendingLen: number;
  heldKind: string | null;
  heldBanId: string | null;
  source: string;
}): void {
  lastIncomingMountSession = {
    banId: normalizeId(data.banId),
    mountedAt: performance.now(),
    source: data.source,
    queueLen: data.queueLen,
    pendingLen: data.pendingLen,
    heldKind: data.heldKind,
    heldBanId: data.heldBanId ? normalizeId(data.heldBanId) : null,
    advanceCallCount: 0,
  };
  emit('[INCOMING MOUNT OWNER DIAG]', data);
}

export function getLastIncomingMountSession(): IncomingMountSession | null {
  return lastIncomingMountSession;
}

export function tracePostIncomingAdvance(
  payload: PostIncomingAdvancePayload,
): void {
  const hasMountedIncoming =
    payload.currentIncomingBanId != null ||
    payload.displayKind === 'incoming' ||
    payload.heldKind === 'incoming';

  if (!hasMountedIncoming) return;

  emit('[POST INCOMING ADVANCE DIAG]', payload);

  const mount = lastIncomingMountSession;
  if (!mount?.banId) return;

  const msSinceMount = Math.round(performance.now() - mount.mountedAt);
  if (msSinceMount < 0) return;

  const mountedNorm = normalizeId(mount.banId);
  const incomingNorm = payload.currentIncomingBanId
    ? normalizeId(payload.currentIncomingBanId)
    : '';
  const heldNorm = payload.heldBanId ? normalizeId(payload.heldBanId) : '';
  const relatesToMount =
    incomingNorm === mountedNorm ||
    heldNorm === mountedNorm ||
    normalizeId(payload.activeBanId ?? '') === mountedNorm;

  if (!relatesToMount && msSinceMount > 30_000) return;

  mount.advanceCallCount += 1;
  const isRetry =
    payload.reason.includes('retry') ||
    payload.source.includes('retry') ||
    payload.pipeline.includes('retry');

  emit('[ADVANCE AFTER INCOMING MOUNT]', {
    ...payload,
    mountedBanId: mount.banId,
    mountSource: mount.source,
    mountQueueLen: mount.queueLen,
    mountPendingLen: mount.pendingLen,
    msSinceMount,
    advanceIndex: mount.advanceCallCount,
    isRetry,
    isNewAdvance: mount.advanceCallCount === 1 && !isRetry,
  });
}
