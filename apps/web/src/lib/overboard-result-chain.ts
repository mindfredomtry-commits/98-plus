import { normalizeId } from '@/lib/normalize-json';
import { isOverkillTerminalOutcome, resolveBanResultOutcome } from '@/lib/overkill-terminal-lock';

export type OverboardResultChainContext = {
  banId: string | null;
  resultOutcome: string | null;
  incomingOverboardAtomicBanId: string | null;
  overlayQueueDrainActive: boolean;
  queueLen: number;
  pendingLen: number;
  directResultOverlay: boolean;
  directResultOverlayActive: boolean;
  heldResultBanId: string | null;
  goToBansAdvancePending: boolean;
  notificationChainTransitioning: boolean;
  chainAdvanceWaiting: boolean;
  notificationMode: string;
  startedFromSection: boolean;
  startedFromDeepLink: boolean;
  startedFromSuccess: boolean;
};

export function isOverboardTerminalResult(
  outcome: string | null | undefined,
): boolean {
  return isOverkillTerminalOutcome(outcome);
}

/** Overboard result shown inside an active notification queue drain — not a standalone direct card. */
export function isOverboardResultInActiveNotificationQueue(
  ctx: OverboardResultChainContext,
): boolean {
  const norm = normalizeId(ctx.banId ?? '');
  if (!norm) return false;

  const atomicNorm = normalizeId(ctx.incomingOverboardAtomicBanId ?? '');
  const isAtomicOverboard = atomicNorm === norm;
  const isOverboardOutcome = isOverboardTerminalResult(ctx.resultOutcome);

  if (!isAtomicOverboard && !isOverboardOutcome) {
    return false;
  }

  const standaloneDirect =
    (ctx.directResultOverlay || ctx.directResultOverlayActive) &&
    ctx.queueLen === 0 &&
    ctx.pendingLen === 0 &&
    !ctx.overlayQueueDrainActive &&
    !isAtomicOverboard;

  if (standaloneDirect) {
    return false;
  }

  if (isAtomicOverboard) return true;
  if (ctx.overlayQueueDrainActive) return true;
  if (ctx.queueLen > 1 || ctx.pendingLen > 0) return true;
  if (
    normalizeId(ctx.heldResultBanId ?? '') === norm &&
    (ctx.queueLen > 0 || ctx.pendingLen > 0)
  ) {
    return true;
  }
  if (
    (ctx.goToBansAdvancePending ||
      ctx.notificationChainTransitioning ||
      ctx.chainAdvanceWaiting) &&
    (ctx.queueLen > 0 || ctx.pendingLen > 0)
  ) {
    return true;
  }
  return false;
}

export function shouldKeepQueueSessionForChainAdvance(
  queueLen: number,
  pendingLen: number,
  chainAdvanceWaiting: boolean,
  notificationChainTransitioning: boolean,
): boolean {
  return (
    (queueLen > 0 || pendingLen > 0) &&
    (chainAdvanceWaiting || notificationChainTransitioning)
  );
}

export function resolveOverboardResultOutcome(
  result: { outcome?: string | null; status?: string | null } | null | undefined,
): string | null {
  const outcome = resolveBanResultOutcome(result);
  return outcome || null;
}
