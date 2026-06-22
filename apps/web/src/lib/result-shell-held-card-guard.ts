'use client';

import type { BanResult } from '@98plus/shared';
import type { QueuedOverlay } from '@/lib/overlay-queue';
import { normalizeId } from '@/lib/normalize-json';
import {
  getMountedBlockingUserOverlay,
  heldUserCardBanId,
  type HeldUserCardOverlay,
} from '@/lib/overlay-user-card-guard';
import {
  isAtomicOverboardShellReady,
  isFinalCheckStatusOutcome,
} from '@/lib/result-display-ready';

export type ResultShellHeldCardGuardContext = {
  awaitingUser: boolean;
  heldKind: 'incoming' | 'check' | 'result' | null;
  heldBanId: string | null;
  mountedIncomingBanId: string | null;
  mountedCheckBanId: string | null;
  atomicOverboardBanId: string | null;
  freshOverboardBanIds: ReadonlySet<string>;
  overboardInFlightBanId: string | null;
  freshFinalStatusBanIds: ReadonlySet<string>;
  resultPriorityBanIds: ReadonlySet<string>;
  chainAdvanceExplicit: boolean;
  queueHeadKind: QueuedOverlay['kind'] | null;
  queueHeadResultBanId: string | null;
};

export function isHeldOrMountedIncomingOrCheckActive(
  ctx: ResultShellHeldCardGuardContext,
): boolean {
  if (!ctx.awaitingUser) return false;
  if (ctx.heldKind === 'incoming' || ctx.heldKind === 'check') return true;
  const mounted = getMountedBlockingUserOverlay({
    incomingBanId: ctx.mountedIncomingBanId,
    checkBanId: ctx.mountedCheckBanId,
  });
  return mounted?.kind === 'incoming' || mounted?.kind === 'check';
}

export function isExplicitFinalStatusForHeldCheckAnswer(
  resultBanId: string,
  result: BanResult | null | undefined,
  ctx: ResultShellHeldCardGuardContext,
): boolean {
  const norm = normalizeId(resultBanId);
  if (!norm || !result) return false;
  if (ctx.freshFinalStatusBanIds.has(norm)) return true;
  if (ctx.chainAdvanceExplicit && ctx.resultPriorityBanIds.has(norm)) {
    return true;
  }
  if (
    ctx.queueHeadKind === 'result' &&
    normalizeId(ctx.queueHeadResultBanId ?? '') === norm &&
    isFinalCheckStatusOutcome(result.outcome)
  ) {
    return true;
  }
  if (
    ctx.heldKind === 'check' &&
    ctx.heldBanId &&
    normalizeId(ctx.heldBanId) === norm &&
    isFinalCheckStatusOutcome(result.outcome)
  ) {
    return true;
  }
  return false;
}

export function isAtomicOverboardResultExempt(
  resultBanId: string,
  result: BanResult | null | undefined,
  ctx: ResultShellHeldCardGuardContext,
): boolean {
  const norm = normalizeId(resultBanId);
  if (!norm) return false;
  const atomic = normalizeId(ctx.atomicOverboardBanId ?? '');
  if (atomic && atomic === norm) return true;
  if (ctx.freshOverboardBanIds.has(norm)) return true;
  if (
    ctx.overboardInFlightBanId &&
    normalizeId(ctx.overboardInFlightBanId) === norm
  ) {
    return true;
  }
  if (
    result &&
    isAtomicOverboardShellReady(result, {
      freshOverboardBanId: ctx.freshOverboardBanIds.has(norm),
      atomicOverboardBanId: atomic === norm,
    })
  ) {
    return true;
  }
  return false;
}

/** Passive result shell must not mount over held/mounted incoming or check. */
export function shouldBlockResultShellOverHeldIncomingOrCheck(
  resultBanId: string,
  result: BanResult | null | undefined,
  ctx: ResultShellHeldCardGuardContext,
): boolean {
  if (!isHeldOrMountedIncomingOrCheckActive(ctx)) return false;
  if (isAtomicOverboardResultExempt(resultBanId, result, ctx)) return false;
  if (isExplicitFinalStatusForHeldCheckAnswer(resultBanId, result, ctx)) {
    return false;
  }
  return true;
}

export function buildResultShellHeldCardGuardContextFromHeld(
  held: HeldUserCardOverlay | null | undefined,
  opts: {
    awaitingUser: boolean;
    mountedIncomingBanId: string | null;
    mountedCheckBanId: string | null;
    atomicOverboardBanId: string | null;
    freshOverboardBanIds: ReadonlySet<string>;
    overboardInFlightBanId: string | null;
    freshFinalStatusBanIds: ReadonlySet<string>;
    resultPriorityBanIds: ReadonlySet<string>;
    chainAdvanceExplicit: boolean;
    queueHead: QueuedOverlay | null;
  },
): ResultShellHeldCardGuardContext {
  return {
    awaitingUser: opts.awaitingUser,
    heldKind: held?.kind ?? null,
    heldBanId: held ? heldUserCardBanId(held) : null,
    mountedIncomingBanId: opts.mountedIncomingBanId,
    mountedCheckBanId: opts.mountedCheckBanId,
    atomicOverboardBanId: opts.atomicOverboardBanId,
    freshOverboardBanIds: opts.freshOverboardBanIds,
    overboardInFlightBanId: opts.overboardInFlightBanId,
    freshFinalStatusBanIds: opts.freshFinalStatusBanIds,
    resultPriorityBanIds: opts.resultPriorityBanIds,
    chainAdvanceExplicit: opts.chainAdvanceExplicit,
    queueHeadKind: opts.queueHead?.kind ?? null,
    queueHeadResultBanId:
      opts.queueHead?.kind === 'result' ? opts.queueHead.result.id : null,
  };
}
