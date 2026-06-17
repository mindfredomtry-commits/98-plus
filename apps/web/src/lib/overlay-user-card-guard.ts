'use client';

import type { BanInteraction, BanResult } from '@98plus/shared';
import type { QueuedOverlay } from '@/lib/overlay-queue';
import { normalizeId } from '@/lib/normalize-json';

export type BlockingUserOverlayKind = 'incoming' | 'check' | 'result';

export type HeldUserCardOverlay =
  | { kind: 'incoming'; ban: BanInteraction }
  | { kind: 'check'; ban: BanInteraction }
  | { kind: 'result'; result: BanResult };

export type ActiveBlockingUserOverlay = {
  kind: BlockingUserOverlayKind;
  banId: string;
};

export function heldUserCardBanId(held: HeldUserCardOverlay): string {
  return held.kind === 'result' ? held.result.id : held.ban.id;
}

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

/** Block clearing mounted overlay while user card awaits action. */
export function shouldBlockOverlayClearWhileUserCardHeld(
  active: ActiveBlockingUserOverlay | null,
  opts?: { explicitUserAction?: boolean },
): boolean {
  if (!active || opts?.explicitUserAction) return false;
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

export function logActiveUserCardPreserveCurrent(
  data: Record<string, unknown>,
): void {
  window.__debug98log?.('[ACTIVE USER CARD PRESERVE CURRENT]', data);
}

export function logActiveUserCardBlockedNextButKeptCurrent(
  data: Record<string, unknown>,
): void {
  window.__debug98log?.('[ACTIVE USER CARD BLOCKED NEXT BUT KEPT CURRENT]', data);
}

export function logActiveUserCardLostBug(data: Record<string, unknown>): void {
  window.__debug98log?.('[ACTIVE USER CARD LOST BUG]', data);
}

export function logActiveUserCardPreventLobbyFallback(
  data: Record<string, unknown>,
): void {
  window.__debug98log?.('[ACTIVE USER CARD PREVENT LOBBY FALLBACK]', data);
}

export function logActiveUserCardPreventOverlayClear(
  data: Record<string, unknown>,
): void {
  window.__debug98log?.('[ACTIVE USER CARD PREVENT OVERLAY CLEAR]', data);
}

export function logTransitionDelaySkippedActiveUserCard(
  data: Record<string, unknown>,
): void {
  window.__debug98log?.('[TRANSITION DELAY SKIPPED ACTIVE USER CARD]', data);
}
