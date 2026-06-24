'use client';

import { normalizeId } from '@/lib/normalize-json';
import {
  shouldBlockChainAdvanceOverActiveUserCard,
  type ActiveBlockingUserOverlay,
} from '@/lib/overlay-user-card-guard';
import type { QueuedOverlay } from '@/lib/overlay-queue';

const pipelineStackFrames: string[] = [];

export function pushHeadSwitchPipelineFrame(frame: string): () => void {
  pipelineStackFrames.push(frame);
  return () => {
    const idx = pipelineStackFrames.lastIndexOf(frame);
    if (idx >= 0) pipelineStackFrames.splice(idx, 1);
  };
}

export function getHeadSwitchPipelineStack(): readonly string[] {
  return pipelineStackFrames;
}

export function runWithHeadSwitchPipelineFrame<T>(
  frame: string,
  fn: () => T,
): T {
  const pop = pushHeadSwitchPipelineFrame(frame);
  try {
    return fn();
  } finally {
    pop();
  }
}

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function snapshotQueueHead(
  item: QueuedOverlay | null | undefined,
): { kind: string; banId: string } | null {
  if (!item) return null;
  const banId =
    item.kind === 'result' ? item.result.id : item.ban.id;
  const norm = normalizeId(banId);
  if (!norm) return null;
  return { kind: item.kind, banId: norm };
}

export type ChainHeadSwitchTraceInput = {
  source: string;
  pipeline?: string | null;
  reason?: string | null;
  calledFrom?: string | null;
  previousHeadKind?: string | null;
  previousHeadBanId?: string | null;
  nextHeadKind: string | null;
  nextHeadBanId: string | null;
  queueHeadBefore?: { kind: string; banId: string } | null;
  queueHeadAfter?: { kind: string; banId: string } | null;
  mountedIncomingBanId?: string | null;
  activeHoldKind?: string | null;
  activeHoldBanId?: string | null;
  queueLen: number;
  pendingLen: number;
  resultPriorityBanIds: string[];
  notificationChainAwaitingUser?: boolean;
  willBlockBecauseActiveHold?: boolean;
  stack?: readonly string[];
};

export function computeWillBlockBecauseActiveHold(input: {
  activeHold: ActiveBlockingUserOverlay | null;
  nextHeadKind: string | null;
  nextHeadBanId: string | null;
  awaitingUser: boolean;
}): boolean {
  if (!input.awaitingUser || !input.activeHold) return false;
  return shouldBlockChainAdvanceOverActiveUserCard(
    input.activeHold,
    input.nextHeadKind as QueuedOverlay['kind'] | null,
    input.nextHeadBanId,
  );
}

export function logChainHeadSwitchTraceExtended(
  input: ChainHeadSwitchTraceInput,
): void {
  const prevKind = input.previousHeadKind ?? input.queueHeadBefore?.kind ?? null;
  const prevBanId = normalizeId(
    input.previousHeadBanId ?? input.queueHeadBefore?.banId ?? '',
  );
  const nextKind = input.nextHeadKind;
  const nextBanId = normalizeId(input.nextHeadBanId ?? '');
  const mountedNorm = normalizeId(input.mountedIncomingBanId ?? '');

  const isSameKind =
    prevKind != null && nextKind != null && prevKind === nextKind;
  const isSameBan =
    prevBanId.length > 0 && nextBanId.length > 0 && prevBanId === nextBanId;

  const stack = [...(input.stack ?? [])];
  const callerStack = stack.join(' > ');

  const payload = {
    source: input.source,
    pipeline: input.pipeline ?? input.source,
    reason: input.reason ?? null,
    calledFrom: input.calledFrom ?? input.source,
    stack,
    callerStack,
    previousHeadKind: prevKind,
    previousHeadBanId: prevBanId || null,
    nextHeadKind: nextKind,
    nextHeadBanId: nextBanId || null,
    mountedIncomingBanId: mountedNorm || null,
    activeHoldKind: input.activeHoldKind ?? null,
    activeHoldBanId: input.activeHoldBanId
      ? normalizeId(input.activeHoldBanId)
      : null,
    queueLen: input.queueLen,
    pendingLen: input.pendingLen,
    resultPriorityBanIds: input.resultPriorityBanIds,
    queueHeadBefore: input.queueHeadBefore ?? null,
    queueHeadAfter: input.queueHeadAfter ?? null,
    isSameBan,
    isSameKind,
    willBlockBecauseActiveHold: input.willBlockBecauseActiveHold ?? false,
    notificationChainAwaitingUser: input.notificationChainAwaitingUser ?? false,
  };

  emit('[CHAIN HEAD SWITCH TRACE]', payload);

  if (
    mountedNorm.length > 0 &&
    nextBanId.length > 0 &&
    nextBanId !== mountedNorm
  ) {
    emit('[HEAD SWITCH OVER MOUNTED INCOMING]', {
      mountedIncomingBanId: mountedNorm,
      nextHeadKind: nextKind,
      nextHeadBanId: nextBanId,
      source: input.source,
      reason: input.reason ?? null,
      pipeline: input.pipeline ?? input.source,
      calledFrom: input.calledFrom ?? input.source,
      stack,
      callerStack,
      queueLen: input.queueLen,
      pendingLen: input.pendingLen,
      activeHoldKind: input.activeHoldKind ?? null,
      activeHoldBanId: input.activeHoldBanId
        ? normalizeId(input.activeHoldBanId)
        : null,
      previousHeadKind: prevKind,
      previousHeadBanId: prevBanId || null,
      resultPriorityBanIds: input.resultPriorityBanIds,
      willBlockBecauseActiveHold: input.willBlockBecauseActiveHold ?? false,
    });
  }
}
