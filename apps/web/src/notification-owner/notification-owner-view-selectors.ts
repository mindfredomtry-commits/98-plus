'use client';

/**
 * Notification-owner view selectors.
 *
 * Pure owner-state readers used by legacy React call sites in Providers.tsx.
 * These are NOT a shadow/mirror/comparison layer — there is no "legacy" side
 * being compared against. Every function here reads exactly one thing: the
 * current `NotificationOverlayOwnerState` / `NotificationOwnerDisplayState`
 * produced by `notification-owner-pin-state.ts`.
 *
 * Signatures intentionally keep a trailing `legacy?: unknown` / `selector`
 * parameter at several call sites purely for source compatibility with the
 * (still very large) set of call sites in Providers.tsx; the values are
 * never read.
 */
import type { BanInteraction, BanResult } from '@98plus/shared';
import type { QueuedOverlay } from '@/lib/overlay-queue';
import { overlayQueueKey } from '@/lib/overlay-queue';
import { normalizeId } from '@/lib/normalize-json';
import type { HeldUserCardOverlay } from '@/lib/overlay-user-card-guard';
import { heldUserCardBanId } from '@/lib/overlay-user-card-guard';
import { observeOverlayKindNullSourceTransition } from '@/lib/overlay-kind-null-source-trace-debug';
import type {
  NotificationOverlayOwnerState,
  NotificationOwnerDisplayState,
} from '@/notification-owner/notification-owner-pin-state';

export type OverlayShellKind = 'incoming' | 'check' | 'result' | null;

/* ------------------------------------------------------------------ */
/* Basic display / queue reads                                         */
/* ------------------------------------------------------------------ */

export function readOwnerOnlyIncomingBan(
  display: NotificationOwnerDisplayState,
  _selector?: string,
  _legacy?: unknown,
): BanInteraction | null {
  return display.incomingBan?.id ? display.incomingBan : null;
}

export function readOwnerOnlyCheckBan(
  display: NotificationOwnerDisplayState,
  _selector?: string,
  _legacy?: unknown,
): BanInteraction | null {
  return display.checkBan?.id ? display.checkBan : null;
}

export function readOwnerOnlyResult(
  display: NotificationOwnerDisplayState,
  _selector?: string,
  _legacy?: unknown,
): BanResult | null {
  return display.result?.id ? display.result : null;
}

export function readOwnerOnlyDirectResultOverlayActive(
  display: NotificationOwnerDisplayState,
  _selector?: string,
  _legacy?: unknown,
): boolean {
  return display.directResultOverlayActive;
}

export function readOwnerOnlyQueueHead(
  ownerQueue: readonly QueuedOverlay[],
  _selector?: string,
  _legacy?: unknown,
): QueuedOverlay | null {
  return ownerQueue[0] ?? null;
}

export function readOwnerOnlyQueueLen(
  ownerQueueLen: number,
  _selector?: string,
  _legacyQueueLen?: number,
): number {
  return ownerQueueLen;
}

export function readOwnerOnlyPendingLen(
  ownerPendingLen: number,
  _selector?: string,
  _legacyPendingLen?: number,
): number {
  return ownerPendingLen;
}

/* ------------------------------------------------------------------ */
/* Held user card / stable / reply / scoped pins                       */
/* ------------------------------------------------------------------ */

export function readOwnerOnlyUserCard(
  ownerUserCard: HeldUserCardOverlay | null,
  _selector?: string,
  _legacy?: unknown,
): HeldUserCardOverlay | null {
  return ownerUserCard;
}

export function readOwnerOnlyStableIncomingBan(
  display: NotificationOwnerDisplayState,
  _selector?: string,
  _legacy?: unknown,
): BanInteraction | null {
  return display.stableIncomingBan?.id ? display.stableIncomingBan : null;
}

export function readOwnerOnlyReplyIncomingBan(
  display: NotificationOwnerDisplayState,
  _selector?: string,
  _legacy?: unknown,
): BanInteraction | null {
  return display.replyIncomingBan?.id ? display.replyIncomingBan : null;
}

export function readOwnerOnlyScopedIncomingBan(
  display: NotificationOwnerDisplayState,
  _selector?: string,
  _legacy?: unknown,
): BanInteraction | null {
  return display.scopedIncomingBan?.id ? display.scopedIncomingBan : null;
}

/* ------------------------------------------------------------------ */
/* Shell reads                                                         */
/* ------------------------------------------------------------------ */

function queueHeadKindFrom(queue: readonly QueuedOverlay[]): OverlayShellKind {
  return queue[0]?.kind ?? null;
}

export function readOwnerOnlyShellQueueHeadKind(
  ownerQueue: readonly QueuedOverlay[],
  _selector?: string,
  _legacy?: unknown,
): OverlayShellKind {
  return queueHeadKindFrom(ownerQueue);
}

export function readOwnerOnlyShellQueueLen(
  ownerQueueLen: number,
  _selector?: string,
  _legacy?: unknown,
): number {
  return ownerQueueLen;
}

export function readOwnerOnlyShellPendingLen(
  ownerPendingLen: number,
  _selector?: string,
  _legacy?: unknown,
): number {
  return ownerPendingLen;
}

export function resolveOwnerShellActiveOverlayKind(
  selector: string,
  opts: {
    showDirectOverboardLayer: boolean;
    heldUserCardKind: 'incoming' | 'check' | 'result' | null | undefined;
    replyFastIncomingActive: boolean;
    queueHeadKind: OverlayShellKind;
  },
): OverlayShellKind {
  const kind: OverlayShellKind = opts.showDirectOverboardLayer
    ? 'result'
    : opts.heldUserCardKind ??
      (opts.replyFastIncomingActive ? 'incoming' : opts.queueHeadKind);
  observeOverlayKindNullSourceTransition(
    `resolveOwnerShellActiveOverlayKind:${selector}`,
    {
      activeKind: kind,
      queueHeadKind: opts.queueHeadKind,
      selectorSource: selector,
      dispatchSource: 'resolveOwnerShellActiveOverlayKind',
      directOverboardMounted: opts.showDirectOverboardLayer,
    },
  );
  return kind;
}

export function readOwnerOnlyShellQueueHeadIncomingBanId(
  ownerQueueHead: QueuedOverlay | null,
  _selector?: string,
  _legacy?: unknown,
): string | null {
  return ownerQueueHead?.kind === 'incoming'
    ? normalizeId(ownerQueueHead.ban.id) || null
    : null;
}

/** Owner-only shell queue head kind for render sites (no legacy fallback). */
export function readOwnerShellQueueHeadKindForRender(
  ownerQueue: readonly QueuedOverlay[],
  _legacy?: unknown,
  _selector?: string,
  _suppressedReason?: string,
): OverlayShellKind {
  return queueHeadKindFrom(ownerQueue);
}

/** Owner-only scoped incoming ban for render sites (no legacy fallback). */
export function readOwnerScopedIncomingForRender(
  display: NotificationOwnerDisplayState,
  _legacy?: unknown,
  _selector?: string,
  _suppressedReason?: string,
): BanInteraction | null {
  return display.scopedIncomingBan?.id ? display.scopedIncomingBan : null;
}

/* ------------------------------------------------------------------ */
/* Imperative reads                                                     */
/* ------------------------------------------------------------------ */

export function readOwnerImperativeState(
  owner: NotificationOverlayOwnerState,
  _selector?: string,
): NotificationOverlayOwnerState {
  return owner;
}

export function readOwnerImperativeQueueHead(
  owner: NotificationOverlayOwnerState,
  _selector?: string,
  _legacy?: unknown,
): QueuedOverlay | null {
  return owner.queue[0] ?? null;
}

export function readOwnerImperativeQueueLen(
  owner: NotificationOverlayOwnerState,
  _selector?: string,
  _legacy?: unknown,
): number {
  return owner.queue.length;
}

export function readOwnerImperativePendingLen(
  owner: NotificationOverlayOwnerState,
  _selector?: string,
  _legacy?: unknown,
): number {
  return owner.pending.length;
}

export function readOwnerImperativePendingHead(
  owner: NotificationOverlayOwnerState,
  _selector?: string,
  _legacy?: unknown,
): QueuedOverlay | null {
  return owner.pending[0] ?? null;
}

export function readOwnerImperativeIncomingBan(
  display: NotificationOwnerDisplayState,
  _selector?: string,
  _legacy?: unknown,
): BanInteraction | null {
  return display.incomingBan?.id ? display.incomingBan : null;
}

export function readOwnerImperativeCheckBan(
  display: NotificationOwnerDisplayState,
  _selector?: string,
  _legacy?: unknown,
): BanInteraction | null {
  return display.checkBan?.id ? display.checkBan : null;
}

export function readOwnerImperativeResult(
  display: NotificationOwnerDisplayState,
  _selector?: string,
  _legacy?: unknown,
): BanResult | null {
  return display.result?.id ? display.result : null;
}

export function readOwnerImperativeStableIncomingBan(
  display: NotificationOwnerDisplayState,
  _selector?: string,
  _legacy?: unknown,
): BanInteraction | null {
  return display.stableIncomingBan?.id ? display.stableIncomingBan : null;
}

export function readOwnerImperativeHeldUserCard(
  owner: NotificationOverlayOwnerState,
  _selector?: string,
  _legacy?: unknown,
): HeldUserCardOverlay | null {
  return owner.holds.userCard;
}

export function readOwnerImperativeAtomicOverboardBanId(
  owner: NotificationOverlayOwnerState,
  _selector?: string,
  _legacy?: unknown,
): string | null {
  return owner.holds.atomicOverboardBanId
    ? normalizeId(owner.holds.atomicOverboardBanId) || null
    : null;
}

export function readOwnerImperativeOverboardInFlightBanId(
  owner: NotificationOverlayOwnerState,
  _selector?: string,
  _legacy?: unknown,
): string | null {
  return owner.holds.overboardInFlightBanId
    ? normalizeId(owner.holds.overboardInFlightBanId) || null
    : null;
}

export function readOwnerImperativeDirectResultOverlayActive(
  display: NotificationOwnerDisplayState,
  _selector?: string,
  _legacy?: unknown,
): boolean {
  return display.directResultOverlayActive;
}

/* ------------------------------------------------------------------ */
/* Chain reads                                                         */
/* ------------------------------------------------------------------ */

export function readOwnerChainState(
  owner: NotificationOverlayOwnerState,
  _selector?: string,
): NotificationOverlayOwnerState {
  return owner;
}

export function readOwnerImperativeDirectResult(
  display: NotificationOwnerDisplayState,
  _selector?: string,
  _legacy?: unknown,
): { overlay: boolean; active: boolean } {
  return {
    overlay: display.directResultOverlay,
    active: display.directResultOverlayActive,
  };
}

export function readOwnerImperativeDirectResultActive(
  display: NotificationOwnerDisplayState,
  selector?: string,
  legacy?: unknown,
): boolean {
  const direct = readOwnerImperativeDirectResult(display, selector, legacy);
  return direct.overlay || direct.active;
}

export function readOwnerImperativeCheckAnswerWaitingHoldBanId(
  owner: NotificationOverlayOwnerState,
  _selector?: string,
  _legacy?: unknown,
): string | null {
  return owner.holds.checkResultWait?.banId
    ? normalizeId(owner.holds.checkResultWait.banId) || null
    : null;
}

export function readOwnerImperativeResultPriority(
  owner: NotificationOverlayOwnerState,
  _selector: string | undefined,
  banId: string,
  _legacy?: unknown,
): boolean {
  const norm = normalizeId(banId) || banId;
  return owner.holds.resultPriorityBanIds.has(norm);
}

export function readOwnerImperativeOverkill(
  owner: NotificationOverlayOwnerState,
  _selector: string | undefined,
  banId: string,
  _legacy?: unknown,
): boolean {
  const norm = normalizeId(banId) || banId;
  return owner.holds.overkillTerminalBanIds.has(norm);
}

/* ------------------------------------------------------------------ */
/* Decision reads (C1)                                                 */
/* ------------------------------------------------------------------ */

export function readOwnerDecisionState(
  owner: NotificationOverlayOwnerState,
  _selector?: string,
): NotificationOverlayOwnerState {
  return owner;
}

export function readOwnerDecisionHasQueueItems(
  owner: NotificationOverlayOwnerState,
  _selector?: string,
  _legacy?: unknown,
): boolean {
  return owner.queue.length > 0;
}

export function readOwnerDecisionHasPendingItems(
  owner: NotificationOverlayOwnerState,
  _selector?: string,
  _legacy?: unknown,
): boolean {
  return owner.pending.length > 0;
}

export function readOwnerDecisionQueueHasIncoming(
  owner: NotificationOverlayOwnerState,
  _selector?: string,
  _legacy?: unknown,
): boolean {
  return owner.queue.some((item) => item.kind === 'incoming');
}

export function readOwnerDecisionPendingHasIncoming(
  owner: NotificationOverlayOwnerState,
  _selector?: string,
  _legacy?: unknown,
): boolean {
  return owner.pending.some((item) => item.kind === 'incoming');
}

export function readOwnerDecisionDisplayIncomingBan(
  display: NotificationOwnerDisplayState,
  _selector?: string,
  _legacy?: unknown,
): BanInteraction | null {
  return display.incomingBan?.id ? display.incomingBan : null;
}

export function readOwnerDecisionDisplayCheckBan(
  display: NotificationOwnerDisplayState,
  _selector?: string,
  _legacy?: unknown,
): BanInteraction | null {
  return display.checkBan?.id ? display.checkBan : null;
}

export function readOwnerDecisionDisplayResultBanId(
  display: NotificationOwnerDisplayState,
  _selector?: string,
  _legacy?: unknown,
): string | null {
  const result = display.result?.id ? display.result : null;
  return result?.id ? normalizeId(result.id) || null : null;
}

export function readOwnerDecisionMountedIncomingBan(
  display: NotificationOwnerDisplayState,
  _selector?: string,
  _legacy?: unknown,
): BanInteraction | null {
  const stable = display.stableIncomingBan?.id ? display.stableIncomingBan : null;
  const incoming = display.incomingBan?.id ? display.incomingBan : null;
  return stable ?? incoming;
}

export function readOwnerDecisionHeldUserCard(
  owner: NotificationOverlayOwnerState,
  _selector?: string,
  _legacy?: unknown,
): HeldUserCardOverlay | null {
  return owner.holds.userCard;
}

export function readOwnerDecisionAtomicBanId(
  owner: NotificationOverlayOwnerState,
  _selector?: string,
  _legacy?: unknown,
): string | null {
  return owner.holds.atomicOverboardBanId
    ? normalizeId(owner.holds.atomicOverboardBanId) || null
    : null;
}

export function readOwnerDecisionOverboardInFlightBanId(
  owner: NotificationOverlayOwnerState,
  _selector?: string,
  _legacy?: unknown,
): string | null {
  return owner.holds.overboardInFlightBanId
    ? normalizeId(owner.holds.overboardInFlightBanId) || null
    : null;
}

export function readOwnerDecisionDirectOverlay(
  display: NotificationOwnerDisplayState,
  _selector?: string,
  _legacy?: unknown,
): boolean {
  return display.directResultOverlay;
}

export function readOwnerDecisionResultPriorityHas(
  owner: NotificationOverlayOwnerState,
  _selector: string | undefined,
  banId: string,
  _legacy?: unknown,
): boolean {
  const norm = normalizeId(banId) || banId;
  return owner.holds.resultPriorityBanIds.has(norm);
}

/* ------------------------------------------------------------------ */
/* Decision reads (C2)                                                 */
/* ------------------------------------------------------------------ */

export function readOwnerC2DecisionState(
  owner: NotificationOverlayOwnerState,
  _selector?: string,
): NotificationOverlayOwnerState {
  return owner;
}

export function readOwnerC2AtomicBanId(
  owner: NotificationOverlayOwnerState,
  _selector?: string,
  _legacy?: unknown,
): string | null {
  return owner.holds.atomicOverboardBanId
    ? normalizeId(owner.holds.atomicOverboardBanId) || null
    : null;
}

export function readOwnerC2AtomicBanIdEquals(
  owner: NotificationOverlayOwnerState,
  selector: string | undefined,
  banId: string | null | undefined,
  legacy?: unknown,
): boolean {
  const ownerId = readOwnerC2AtomicBanId(owner, selector, legacy);
  const norm = banId ? normalizeId(banId) || banId : null;
  return ownerId === norm;
}

export function readOwnerC2OverboardInFlightBanId(
  owner: NotificationOverlayOwnerState,
  _selector?: string,
  _legacy?: unknown,
): string | null {
  return owner.holds.overboardInFlightBanId
    ? normalizeId(owner.holds.overboardInFlightBanId) || null
    : null;
}

export function readOwnerC2OverboardInFlightEquals(
  owner: NotificationOverlayOwnerState,
  _selector: string | undefined,
  banId: string | null | undefined,
  _legacy?: unknown,
): boolean {
  const ownerId = owner.holds.overboardInFlightBanId
    ? normalizeId(owner.holds.overboardInFlightBanId) || null
    : null;
  const norm = banId ? normalizeId(banId) || banId : null;
  return ownerId === norm;
}

export function readOwnerC2DisplayIncomingBan(
  display: NotificationOwnerDisplayState,
  _selector?: string,
  _legacy?: unknown,
): BanInteraction | null {
  return display.incomingBan?.id ? display.incomingBan : null;
}

export function readOwnerC2DisplayResultBanId(
  display: NotificationOwnerDisplayState,
  _selector?: string,
  _legacy?: unknown,
): string | null {
  const result = display.result?.id ? display.result : null;
  return result?.id ? normalizeId(result.id) || null : null;
}

export function readOwnerC2DirectOverlay(
  display: NotificationOwnerDisplayState,
  _selector?: string,
  _legacy?: unknown,
): boolean {
  return display.directResultOverlay;
}

export function readOwnerC2ResultPriorityHas(
  owner: NotificationOverlayOwnerState,
  _selector: string | undefined,
  banId: string,
  _legacy?: unknown,
): boolean {
  const norm = normalizeId(banId) || banId;
  return owner.holds.resultPriorityBanIds.has(norm);
}

export function readOwnerC2QueueLengthChanged(
  owner: NotificationOverlayOwnerState,
  _selector: string | undefined,
  nextLen: number,
  _legacy?: unknown,
): boolean {
  return nextLen !== owner.queue.length;
}

export function readOwnerC2PendingLengthChanged(
  owner: NotificationOverlayOwnerState,
  _selector: string | undefined,
  nextLen: number,
  _legacy?: unknown,
): boolean {
  return nextLen !== owner.pending.length;
}

/* ------------------------------------------------------------------ */
/* Decision reads (C3)                                                 */
/* ------------------------------------------------------------------ */

export function readOwnerC3DecisionState(
  owner: NotificationOverlayOwnerState,
  _selector?: string,
): NotificationOverlayOwnerState {
  return owner;
}

export function readOwnerC3AtomicBanId(
  owner: NotificationOverlayOwnerState,
  _selector?: string,
  _legacy?: unknown,
): string | null {
  return owner.holds.atomicOverboardBanId
    ? normalizeId(owner.holds.atomicOverboardBanId) || null
    : null;
}

export function readOwnerC3AtomicBanIdEquals(
  owner: NotificationOverlayOwnerState,
  selector: string | undefined,
  banId: string | null | undefined,
  legacy?: unknown,
): boolean {
  const ownerId = readOwnerC3AtomicBanId(owner, selector, legacy);
  const norm = banId ? normalizeId(banId) || banId : null;
  return ownerId === norm;
}

export function readOwnerC3OverboardInFlightBanId(
  owner: NotificationOverlayOwnerState,
  _selector?: string,
  _legacy?: unknown,
): string | null {
  return owner.holds.overboardInFlightBanId
    ? normalizeId(owner.holds.overboardInFlightBanId) || null
    : null;
}

export function readOwnerC3OverboardInFlightEquals(
  owner: NotificationOverlayOwnerState,
  selector: string | undefined,
  banId: string | null | undefined,
  legacy?: unknown,
): boolean {
  const ownerId = readOwnerC3OverboardInFlightBanId(owner, selector, legacy);
  const norm = banId ? normalizeId(banId) || banId : null;
  return ownerId === norm;
}

export function readOwnerC3DisplayIncomingBan(
  display: NotificationOwnerDisplayState,
  _selector?: string,
  _legacy?: unknown,
): BanInteraction | null {
  return display.incomingBan?.id ? display.incomingBan : null;
}

export function readOwnerC3DisplayIncomingBanIdEquals(
  display: NotificationOwnerDisplayState,
  selector: string | undefined,
  banId: string | null | undefined,
  legacy?: unknown,
): boolean {
  const ownerBan = readOwnerC3DisplayIncomingBan(display, selector, legacy);
  const norm = banId ? normalizeId(banId) || banId : null;
  return ownerBan?.id ? normalizeId(ownerBan.id) === norm : false;
}

export function readOwnerC3DisplayResultBanId(
  display: NotificationOwnerDisplayState,
  _selector?: string,
  _legacy?: unknown,
): string | null {
  const result = display.result?.id ? display.result : null;
  return result?.id ? normalizeId(result.id) || null : null;
}

export function readOwnerC3DisplayResult(
  display: NotificationOwnerDisplayState,
  _selector?: string,
  _legacy?: unknown,
): BanResult | null {
  return display.result?.id ? display.result : null;
}

export function readOwnerC3DirectOverlay(
  display: NotificationOwnerDisplayState,
  _selector?: string,
  _legacy?: unknown,
): boolean {
  return display.directResultOverlay;
}

export function readOwnerC3IsDirectOverboardLayerActive(
  display: NotificationOwnerDisplayState,
  _selector?: string,
  _legacy?: unknown,
): boolean {
  return display.directResultOverlay || display.directResultOverlayActive;
}

export function readOwnerC3HasMountedResult(
  display: NotificationOwnerDisplayState,
  selector?: string,
  legacy?: unknown,
): boolean {
  return Boolean(readOwnerC3DisplayResultBanId(display, selector, legacy));
}

/* ------------------------------------------------------------------ */
/* Runtime wrappers (formerly "ForRuntime" parity-logging variants)    */
/* ------------------------------------------------------------------ */

export function readOwnerImperativeQueueHeadForRuntime(
  owner: NotificationOverlayOwnerState,
  selector?: string,
  legacy?: unknown,
): QueuedOverlay | null {
  return readOwnerImperativeQueueHead(owner, selector, legacy);
}

export function readOwnerImperativeIncomingBanForRuntime(
  display: NotificationOwnerDisplayState,
  selector?: string,
  legacy?: unknown,
): BanInteraction | null {
  return readOwnerImperativeIncomingBan(display, selector, legacy);
}

export function readOwnerImperativeCheckBanForRuntime(
  display: NotificationOwnerDisplayState,
  selector?: string,
  legacy?: unknown,
): BanInteraction | null {
  return readOwnerImperativeCheckBan(display, selector, legacy);
}

export function readOwnerImperativeResultForRuntime(
  display: NotificationOwnerDisplayState,
  selector?: string,
  legacy?: unknown,
): BanResult | null {
  return readOwnerImperativeResult(display, selector, legacy);
}

export function readOwnerImperativeCheckAnswerWaitingHoldBanIdForRuntime(
  owner: NotificationOverlayOwnerState,
  selector?: string,
  legacy?: unknown,
): string | null {
  return readOwnerImperativeCheckAnswerWaitingHoldBanId(owner, selector, legacy);
}

export function readOwnerDecisionDisplayIncomingBanForRuntime(
  display: NotificationOwnerDisplayState,
  selector?: string,
  legacy?: unknown,
): BanInteraction | null {
  return readOwnerDecisionDisplayIncomingBan(display, selector, legacy);
}

export function readOwnerDecisionDisplayCheckBanForRuntime(
  display: NotificationOwnerDisplayState,
  selector?: string,
  legacy?: unknown,
): BanInteraction | null {
  return readOwnerDecisionDisplayCheckBan(display, selector, legacy);
}

export function readOwnerDecisionDisplayResultBanIdForRuntime(
  display: NotificationOwnerDisplayState,
  selector?: string,
  legacy?: unknown,
): string | null {
  return readOwnerDecisionDisplayResultBanId(display, selector, legacy);
}

export function readOwnerC2DisplayIncomingBanForRuntime(
  display: NotificationOwnerDisplayState,
  selector?: string,
  legacy?: unknown,
): BanInteraction | null {
  return readOwnerC2DisplayIncomingBan(display, selector, legacy);
}

export function readOwnerC2DisplayResultBanIdForRuntime(
  display: NotificationOwnerDisplayState,
  selector?: string,
  legacy?: unknown,
): string | null {
  return readOwnerC2DisplayResultBanId(display, selector, legacy);
}

export function readOwnerC3DisplayIncomingBanForRuntime(
  display: NotificationOwnerDisplayState,
  selector?: string,
  legacy?: unknown,
): BanInteraction | null {
  return readOwnerC3DisplayIncomingBan(display, selector, legacy);
}

export function readOwnerC3DisplayResultBanIdForRuntime(
  display: NotificationOwnerDisplayState,
  selector?: string,
  legacy?: unknown,
): string | null {
  return readOwnerC3DisplayResultBanId(display, selector, legacy);
}

export function readOwnerC3DisplayResultForRuntime(
  display: NotificationOwnerDisplayState,
  selector?: string,
  legacy?: unknown,
): BanResult | null {
  return readOwnerC3DisplayResult(display, selector, legacy);
}

/* ------------------------------------------------------------------ */
/* Phase-12-era decision helpers (queue-head / drain-gate / fresh flags) */
/* ------------------------------------------------------------------ */

export function readOwnerDecisionShellAtomicBanId(
  owner: NotificationOverlayOwnerState,
  _legacyAtomicRef?: string | null,
  _component?: string,
  _decision?: string,
): string {
  return (
    readOwnerC2AtomicBanId(owner, 'renderShellKind', undefined) ?? ''
  );
}

export function readOwnerDecisionShellDisplayResultId(
  display: NotificationOwnerDisplayState,
  _legacy?: unknown,
  _component?: string,
  _decision?: string,
): string {
  const ownerResult = readOwnerOnlyResult(display, 'effectiveNotificationQueueShellKind');
  return normalizeId(ownerResult?.id ?? '') || '';
}

export function readOwnerDecisionFreshOverboardActionLive(
  owner: NotificationOverlayOwnerState,
  atomicNorm: string,
  _legacyFreshIds?: ReadonlySet<string>,
  _component?: string,
  _decision?: string,
): boolean {
  if (!atomicNorm) return false;
  return (
    owner.holds.overkillTerminalBanIds.has(atomicNorm) ||
    normalizeId(owner.holds.atomicOverboardBanId ?? '') === atomicNorm ||
    owner.holds.resultPriorityBanIds.has(atomicNorm)
  );
}

export type ShowNextHeadDecision = {
  head: QueuedOverlay | null;
  startupHead: QueuedOverlay | null;
  overlayLen: number;
  startupLen: number;
  hasNext: boolean;
  nextKind: QueuedOverlay['kind'] | null;
  nextBanId: string | null;
};

export function resolveShowNextHeadDecision(
  owner: NotificationOverlayOwnerState,
  _legacyQueue?: readonly QueuedOverlay[],
  _legacyPending?: readonly QueuedOverlay[],
): ShowNextHeadDecision {
  const overlayLen = owner.queue.length;
  const startupLen = owner.pending.length;
  const head = owner.queue[0] ?? null;
  const startupHead =
    owner.pending.find((item) => item.kind !== 'result') ??
    owner.pending[0] ??
    null;
  const hasNext = overlayLen > 0 || startupLen > 0;
  const nextKind = head?.kind ?? startupHead?.kind ?? null;
  const nextBanId =
    head?.kind === 'result'
      ? head.result.id
      : head?.kind === 'incoming' || head?.kind === 'check'
        ? head.ban.id
        : startupHead?.kind === 'incoming' || startupHead?.kind === 'check'
          ? startupHead.ban.id
          : startupHead?.kind === 'result'
            ? startupHead.result.id
            : null;
  return {
    head,
    startupHead,
    overlayLen,
    startupLen,
    hasNext,
    nextKind,
    nextBanId,
  };
}

export type LobbyBansDrainGateDecision = {
  canDrain: boolean;
  ownerPending: number;
  ownerQueue: number;
  legacyPending: number;
  legacyQueue: number;
  legacyWouldDrain: boolean;
  reason: string;
};

export function resolveLobbyBansDrainGateDecision(
  owner: NotificationOverlayOwnerState,
  legacy?: {
    pendingLen: number;
    queueLen: number;
    incomingPresent: boolean;
    checkPresent: boolean;
    resultPresent: boolean;
    hasPendingChain: boolean;
  },
): LobbyBansDrainGateDecision {
  const ownerPending = owner.pending.length;
  const ownerQueue = owner.queue.length;
  const canDrain = ownerPending > 0 || ownerQueue > 0;
  const reason = canDrain
    ? 'owner-pending-or-queue-nonempty'
    : 'owner-queue-empty';
  return {
    canDrain,
    ownerPending,
    ownerQueue,
    legacyPending: legacy?.pendingLen ?? 0,
    legacyQueue: legacy?.queueLen ?? 0,
    legacyWouldDrain: false,
    reason,
  };
}

export function readOwnerDecisionSyncDisplayQueue(
  ownerQueue: readonly QueuedOverlay[],
  _legacyQueue?: readonly QueuedOverlay[],
): readonly QueuedOverlay[] {
  return ownerQueue;
}

export function mapOverlayQueueItemIds(
  queue: readonly QueuedOverlay[],
): string[] {
  return queue.map((item) => overlayQueueKey(item));
}
