'use client';

import type { QueuedOverlay } from '@/lib/overlay-queue';
import { normalizeId } from '@/lib/normalize-json';

export type BlockingUserOverlayKind = 'incoming' | 'check' | 'result';

export type ActiveBlockingUserOverlay = {
  kind: BlockingUserOverlayKind;
  banId: string;
};

export function isBlockingUserOverlayKind(
  kind: string | null | undefined,
): kind is BlockingUserOverlayKind {
  return kind === 'incoming' || kind === 'check' || kind === 'result';
}

export function getMountedBlockingUserOverlay(ctx: {
  incomingBanId?: string | null;
  checkBanId?: string | null;
  resultBanId?: string | null;
}): ActiveBlockingUserOverlay | null {
  const incoming = ctx.incomingBanId?.trim() ?? '';
  if (incoming) return { kind: 'incoming', banId: incoming };
  const check = ctx.checkBanId?.trim() ?? '';
  if (check) return { kind: 'check', banId: check };
  const result = ctx.resultBanId?.trim() ?? '';
  if (result) return { kind: 'result', banId: result };
  return null;
}

export function overlayItemBanId(item: QueuedOverlay): string {
  return item.kind === 'result'
    ? normalizeId(item.result.id)
    : normalizeId(item.ban.id);
}

/** Same ban may advance incoming → check/result (stale incoming). Different banId may not replace. */
export function shouldBlockChainAdvanceOverActiveUserCard(
  active: ActiveBlockingUserOverlay | null,
  nextKind: QueuedOverlay['kind'] | null,
  nextBanId: string | null,
  opts?: { explicitUserAction?: boolean },
): boolean {
  if (!active || opts?.explicitUserAction) return false;
  if (!nextKind || !nextBanId) return false;
  const nextNorm = normalizeId(nextBanId);
  const activeNorm = normalizeId(active.banId);
  if (!nextNorm || !activeNorm) return false;
  if (active.kind === nextKind && activeNorm === nextNorm) return false;
  if (activeNorm === nextNorm) return false;
  return isBlockingUserOverlayKind(active.kind);
}

export function logActiveUserCardHold(data: Record<string, unknown>): void {
  window.__debug98log?.('[ACTIVE USER CARD HOLD]', data);
}

export function logChainAdvanceBlockedActiveUserCard(
  data: Record<string, unknown>,
): void {
  window.__debug98log?.('[CHAIN ADVANCE BLOCKED ACTIVE USER CARD]', data);
}

export function logChainLookaheadOnlyActiveUserCard(
  data: Record<string, unknown>,
): void {
  window.__debug98log?.('[CHAIN LOOKAHEAD ONLY ACTIVE USER CARD]', data);
}

export function logIncomingReplacedBug(data: Record<string, unknown>): void {
  window.__debug98log?.('[INCOMING REPLACED BUG]', data);
}
