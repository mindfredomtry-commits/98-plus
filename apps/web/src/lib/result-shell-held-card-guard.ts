import type { BanResult } from '@98plus/shared';
import {
  heldUserCardBanId,
  type HeldUserCardOverlay,
} from '@/lib/overlay-user-card-guard';
import { normalizeId } from '@/lib/normalize-json';
import { isFinalCheckStatusOutcome } from '@/lib/result-display-ready';

export type ResultShellHeldCardGuardContext = {
  awaitingUser: boolean;
  held: HeldUserCardOverlay | null;
  incomingBanId: string | null;
  checkBanId: string | null;
  atomicOverboardBanId: string | null;
  freshOverboardBanIds: ReadonlySet<string>;
  freshFinalStatusBanIds: ReadonlySet<string>;
  resultPriorityBanIds: ReadonlySet<string>;
  overboardInFlightBanId: string | null;
  chainAdvanceExplicit: boolean;
  resultBanId: string | null | undefined;
  result?: BanResult | null;
  queueHeadKind: string | null;
  queueHeadResultBanId: string | null;
};

function isHeldIncomingOrCheckStillMounted(
  held: HeldUserCardOverlay,
  incomingBanId: string | null,
  checkBanId: string | null,
): boolean {
  const heldBanId = normalizeId(heldUserCardBanId(held));
  if (!heldBanId) return false;
  if (held.kind === 'incoming') {
    return normalizeId(incomingBanId ?? '') === heldBanId;
  }
  if (held.kind === 'check') {
    return normalizeId(checkBanId ?? '') === heldBanId;
  }
  return false;
}

function isAtomicOverboardShellExempt(
  ctx: ResultShellHeldCardGuardContext,
): boolean {
  const norm = normalizeId(ctx.resultBanId ?? '');
  if (!norm) return false;
  if (ctx.atomicOverboardBanId === norm) return true;
  if (ctx.freshOverboardBanIds.has(norm)) return true;
  if (ctx.overboardInFlightBanId === norm) return true;
  return false;
}

function isCheckAnswerFinalShellExempt(
  ctx: ResultShellHeldCardGuardContext,
): boolean {
  const norm = normalizeId(ctx.resultBanId ?? '');
  if (!norm) return false;
  if (ctx.freshFinalStatusBanIds.has(norm)) return true;
  const payload = ctx.result;
  const outcome =
    payload && normalizeId(payload.id) === norm ? payload.outcome : null;
  if (!isFinalCheckStatusOutcome(outcome)) return false;
  if (!ctx.resultPriorityBanIds.has(norm)) return false;
  if (
    ctx.queueHeadKind === 'result' &&
    normalizeId(ctx.queueHeadResultBanId ?? '') === norm
  ) {
    return true;
  }
  return ctx.chainAdvanceExplicit;
}

/** Block passive result shell while user awaits action on mounted incoming/check. */
export function shouldBlockResultShellOverHeldIncomingOrCheck(
  ctx: ResultShellHeldCardGuardContext,
): boolean {
  if (!ctx.awaitingUser || !ctx.held) return false;
  if (ctx.held.kind !== 'incoming' && ctx.held.kind !== 'check') return false;
  if (
    !isHeldIncomingOrCheckStillMounted(
      ctx.held,
      ctx.incomingBanId,
      ctx.checkBanId,
    )
  ) {
    return false;
  }
  if (isAtomicOverboardShellExempt(ctx)) return false;
  if (isCheckAnswerFinalShellExempt(ctx)) return false;
  if (ctx.held.kind === 'check') {
    const heldBanId = normalizeId(heldUserCardBanId(ctx.held));
    const resultNorm = normalizeId(ctx.resultBanId ?? '');
    if (resultNorm === heldBanId) {
      const outcome =
        ctx.result && normalizeId(ctx.result.id) === resultNorm
          ? ctx.result.outcome
          : null;
      if (isFinalCheckStatusOutcome(outcome)) return false;
    }
  }
  return true;
}
