'use client';

import type { BanInteraction, BanResult } from '@98plus/shared';
import type { QueuedOverlay } from '@/lib/overlay-queue';
import { normalizeId } from '@/lib/normalize-json';
import type {
  NotificationOverlayOwnerState,
  NotificationOwnerDisplayState,
} from '@/lib/notification-overlay-owner';
import type { HeldUserCardOverlay } from '@/lib/overlay-user-card-guard';
import { heldUserCardBanId } from '@/lib/overlay-user-card-guard';
import {
  logOwnerPhase11B8ChainFallback,
  logOwnerPhase11B8ChainMismatch,
  logOwnerPhase11B8ChainRead,
  logOwnerPhase11C1DecisionFallback,
  logOwnerPhase11C1DecisionMismatch,
  logOwnerPhase11C1DecisionRead,
  logOwnerPhase11C2DecisionFallback,
  logOwnerPhase11C2DecisionMismatch,
  logOwnerPhase11C2DecisionRead,
  logOwnerPhase11C3DecisionFallback,
  logOwnerPhase11C3DecisionMismatch,
  logOwnerPhase11C3DecisionRead,
} from '@/lib/notification-overlay-owner-debug';

export type OwnerChainReadSelector =
  | 'chainContinue'
  | 'continueNotificationChainOrOpenLobbySync'
  | 'suppressQueuedOverlayDisplay'
  | 'isDirectOverboardLocallyActive'
  | 'isCheckAnswerWaitingResultHoldActive'
  | 'hasActiveNotificationOverlayMounted'
  | 'hasPendingNotificationChain'
  | 'hasActiveNotificationShellForHandoff'
  | 'syncDisplayFromQueue'
  | 'resultOverboardCallback'
  | 'lockOverkillTerminal'
  | 'resumeCheckAnswerChain'
  | 'providersReset'
  | 'buildResultShellHeldCardGuardContext'
  | 'mergeStartupIntoOverlayQueueOnly';

type LegacyDirectResultCompare = {
  overlayRef?: boolean;
  activeRef?: boolean;
};

type LegacyQueueCompare = {
  queueRef?: readonly QueuedOverlay[];
};

type LegacyPendingCompare = {
  pendingRef?: readonly QueuedOverlay[];
};

type LegacyHeldCompare = {
  ref?: HeldUserCardOverlay | null;
};

type LegacyBanCompare = {
  ref?: BanInteraction | null;
  state?: BanInteraction | null;
};

type LegacyStringCompare = {
  ref?: string | null;
};

type LegacySetCompare = {
  ref?: ReadonlySet<string>;
};

function compareIds11B8(
  selector: OwnerChainReadSelector,
  field: string,
  ownerValue: string | null,
  legacyValue: string | null,
): void {
  if (ownerValue === legacyValue) return;
  logOwnerPhase11B8ChainMismatch({
    selector,
    field,
    owner: ownerValue,
    legacy: legacyValue,
  });
}

function compareBools11B8(
  selector: OwnerChainReadSelector,
  field: string,
  ownerValue: boolean,
  legacyValue: boolean,
): void {
  if (ownerValue === legacyValue) return;
  logOwnerPhase11B8ChainMismatch({
    selector,
    field,
    owner: ownerValue,
    legacy: legacyValue,
  });
}

function compareNumbers11B8(
  selector: OwnerChainReadSelector,
  field: string,
  ownerValue: number,
  legacyValue: number,
): void {
  if (ownerValue === legacyValue) return;
  logOwnerPhase11B8ChainMismatch({
    selector,
    field,
    owner: ownerValue,
    legacy: legacyValue,
  });
}

function compareSetMember11B8(
  selector: OwnerChainReadSelector,
  field: string,
  banId: string,
  ownerHas: boolean,
  legacyHas: boolean,
): void {
  if (ownerHas === legacyHas) return;
  logOwnerPhase11B8ChainMismatch({
    selector,
    field,
    banId,
    owner: ownerHas,
    legacy: legacyHas,
  });
}

/** Phase 11B.8: owner direct overboard overlay flags for chain/overboard guards. */
export function readOwnerImperativeDirectResult(
  display: NotificationOwnerDisplayState,
  selector: OwnerChainReadSelector,
  legacy?: LegacyDirectResultCompare,
): { overlay: boolean; active: boolean } {
  const overlay = display.directResultOverlay;
  const active = display.directResultOverlayActive;
  logOwnerPhase11B8ChainRead({
    selector,
    field: 'directResultOverlay',
    overlay,
    active,
  });
  if (legacy) {
    compareBools11B8(
      selector,
      'directResultOverlay',
      overlay,
      legacy.overlayRef ?? false,
    );
    compareBools11B8(
      selector,
      'directResultOverlayActive',
      active,
      legacy.activeRef ?? false,
    );
  }
  return { overlay, active };
}

export function readOwnerImperativeDirectResultActive(
  display: NotificationOwnerDisplayState,
  selector: OwnerChainReadSelector,
  legacy?: LegacyDirectResultCompare,
): boolean {
  const direct = readOwnerImperativeDirectResult(display, selector, legacy);
  return direct.overlay || direct.active;
}

/** Phase 11B.8: owner check-answer waiting result hold ban id. */
export function readOwnerImperativeCheckAnswerWaitingHoldBanId(
  owner: NotificationOverlayOwnerState,
  selector: OwnerChainReadSelector,
  legacy?: LegacyStringCompare,
): string | null {
  const ownerId = owner.holds.checkResultWait?.banId
    ? normalizeId(owner.holds.checkResultWait.banId) || null
    : null;
  logOwnerPhase11B8ChainRead({
    selector,
    field: 'checkAnswerWaitingHoldBanId',
    banId: ownerId,
  });
  if (legacy) {
    compareIds11B8(
      selector,
      'checkAnswerWaitingHoldBanId',
      ownerId,
      legacy.ref ? normalizeId(legacy.ref) || null : null,
    );
  }
  return ownerId;
}

export function readOwnerImperativeCheckAnswerWaitingHoldBanIdWithLegacyFallback(
  owner: NotificationOverlayOwnerState,
  selector: OwnerChainReadSelector,
  legacy: LegacyStringCompare,
  reason: string,
): string | null {
  const ownerId = readOwnerImperativeCheckAnswerWaitingHoldBanId(
    owner,
    selector,
    legacy,
  );
  if (ownerId) return ownerId;
  const fallback = legacy.ref ? normalizeId(legacy.ref) || null : null;
  if (fallback) {
    logOwnerPhase11B8ChainFallback({
      selector,
      reason,
      field: 'checkAnswerWaitingHoldBanId',
      banId: fallback,
    });
    compareIds11B8(selector, 'checkAnswerWaitingHoldBanId', null, fallback);
  }
  return fallback;
}

/** Phase 11B.8: owner result priority set membership. */
export function readOwnerImperativeResultPriority(
  owner: NotificationOverlayOwnerState,
  selector: OwnerChainReadSelector,
  banId: string,
  legacy?: LegacySetCompare,
): boolean {
  const norm = normalizeId(banId) || banId;
  const ownerHas = owner.holds.resultPriorityBanIds.has(norm);
  logOwnerPhase11B8ChainRead({
    selector,
    field: 'resultPriority',
    banId: norm,
    value: ownerHas,
  });
  if (legacy?.ref) {
    compareSetMember11B8(
      selector,
      'resultPriority',
      norm,
      ownerHas,
      legacy.ref.has(norm),
    );
  }
  return ownerHas;
}

/** Phase 11B.8: owner overkill terminal set membership. */
export function readOwnerImperativeOverkill(
  owner: NotificationOverlayOwnerState,
  selector: OwnerChainReadSelector,
  banId: string,
  legacy?: LegacySetCompare,
): boolean {
  const norm = normalizeId(banId) || banId;
  const ownerHas = owner.holds.overkillTerminalBanIds.has(norm);
  logOwnerPhase11B8ChainRead({
    selector,
    field: 'overkillTerminal',
    banId: norm,
    value: ownerHas,
  });
  if (legacy?.ref) {
    compareSetMember11B8(
      selector,
      'overkillTerminal',
      norm,
      ownerHas,
      legacy.ref.has(norm),
    );
  }
  return ownerHas;
}

/** Phase 11B.8: owner chain state snapshot read. */
export function readOwnerChainState(
  owner: NotificationOverlayOwnerState,
  selector: OwnerChainReadSelector,
): NotificationOverlayOwnerState {
  logOwnerPhase11B8ChainRead({
    selector,
    field: 'state',
    queueLen: owner.queue.length,
    pendingLen: owner.pending.length,
  });
  return owner;
}

export type OwnerDecisionReadSelector =
  | 'hasPendingNotificationChain'
  | 'hasActiveNotificationOverlayMounted'
  | 'hasActiveNotificationShellForHandoff'
  | 'countLobbyPendingHasIncoming'
  | 'buildPassiveResultGateContext'
  | 'isResultBlockedForNotificationChain'
  | 'enqueueNotification'
  | 'reportOverlayRendered'
  | 'clearStaleOverlayRefsForActive'
  | 'composeEnterGuard';

function compareIds11C1(
  selector: OwnerDecisionReadSelector,
  field: string,
  ownerValue: string | null,
  legacyValue: string | null,
): void {
  if (ownerValue === legacyValue) return;
  logOwnerPhase11C1DecisionMismatch({
    selector,
    field,
    owner: ownerValue,
    legacy: legacyValue,
  });
}

function compareBools11C1(
  selector: OwnerDecisionReadSelector,
  field: string,
  ownerValue: boolean,
  legacyValue: boolean,
): void {
  if (ownerValue === legacyValue) return;
  logOwnerPhase11C1DecisionMismatch({
    selector,
    field,
    owner: ownerValue,
    legacy: legacyValue,
  });
}

function compareNumbers11C1(
  selector: OwnerDecisionReadSelector,
  field: string,
  ownerValue: number,
  legacyValue: number,
): void {
  if (ownerValue === legacyValue) return;
  logOwnerPhase11C1DecisionMismatch({
    selector,
    field,
    owner: ownerValue,
    legacy: legacyValue,
  });
}

/** Phase 11C.1: owner decision state snapshot read. */
export function readOwnerDecisionState(
  owner: NotificationOverlayOwnerState,
  selector: OwnerDecisionReadSelector,
): NotificationOverlayOwnerState {
  logOwnerPhase11C1DecisionRead({
    selector,
    field: 'state',
    queueLen: owner.queue.length,
    pendingLen: owner.pending.length,
  });
  return owner;
}

export function readOwnerDecisionHasQueueItems(
  owner: NotificationOverlayOwnerState,
  selector: OwnerDecisionReadSelector,
  legacy?: LegacyQueueCompare,
): boolean {
  const ownerHas = owner.queue.length > 0;
  logOwnerPhase11C1DecisionRead({
    selector,
    field: 'hasQueueItems',
    value: ownerHas,
    queueLen: owner.queue.length,
  });
  if (legacy?.queueRef) {
    compareBools11C1(
      selector,
      'hasQueueItems',
      ownerHas,
      legacy.queueRef.length > 0,
    );
  }
  return ownerHas;
}

export function readOwnerDecisionHasPendingItems(
  owner: NotificationOverlayOwnerState,
  selector: OwnerDecisionReadSelector,
  legacy?: LegacyPendingCompare,
): boolean {
  const ownerHas = owner.pending.length > 0;
  logOwnerPhase11C1DecisionRead({
    selector,
    field: 'hasPendingItems',
    value: ownerHas,
    pendingLen: owner.pending.length,
  });
  if (legacy?.pendingRef) {
    compareBools11C1(
      selector,
      'hasPendingItems',
      ownerHas,
      legacy.pendingRef.length > 0,
    );
  }
  return ownerHas;
}

export function readOwnerDecisionQueueHasIncoming(
  owner: NotificationOverlayOwnerState,
  selector: OwnerDecisionReadSelector,
  legacy?: LegacyQueueCompare,
): boolean {
  const ownerHas = owner.queue.some((item) => item.kind === 'incoming');
  logOwnerPhase11C1DecisionRead({ selector, field: 'queueHasIncoming', value: ownerHas });
  if (legacy?.queueRef) {
    compareBools11C1(
      selector,
      'queueHasIncoming',
      ownerHas,
      legacy.queueRef.some((item) => item.kind === 'incoming'),
    );
  }
  return ownerHas;
}

export function readOwnerDecisionPendingHasIncoming(
  owner: NotificationOverlayOwnerState,
  selector: OwnerDecisionReadSelector,
  legacy?: LegacyPendingCompare,
): boolean {
  const ownerHas = owner.pending.some((item) => item.kind === 'incoming');
  logOwnerPhase11C1DecisionRead({ selector, field: 'pendingHasIncoming', value: ownerHas });
  if (legacy?.pendingRef) {
    compareBools11C1(
      selector,
      'pendingHasIncoming',
      ownerHas,
      legacy.pendingRef.some((item) => item.kind === 'incoming'),
    );
  }
  return ownerHas;
}

export function readOwnerDecisionDisplayIncomingBan(
  display: NotificationOwnerDisplayState,
  selector: OwnerDecisionReadSelector,
  legacy?: LegacyBanCompare,
): BanInteraction | null {
  const ownerBan = display.incomingBan?.id ? display.incomingBan : null;
  logOwnerPhase11C1DecisionRead({
    selector,
    field: 'incomingBan',
    banId: ownerBan?.id ?? null,
  });
  if (legacy) {
    const legacyBan = legacy.state ?? legacy.ref ?? null;
    compareIds11C1(
      selector,
      'incomingBan',
      ownerBan?.id ?? null,
      legacyBan?.id ?? null,
    );
  }
  return ownerBan;
}

export function readOwnerDecisionDisplayIncomingBanWithLegacyFallback(
  display: NotificationOwnerDisplayState,
  selector: OwnerDecisionReadSelector,
  legacy: LegacyBanCompare,
): BanInteraction | null {
  const ownerBan = readOwnerDecisionDisplayIncomingBan(display, selector, legacy);
  if (ownerBan) return ownerBan;
  const fallback = legacy.state ?? legacy.ref ?? null;
  if (fallback?.id) {
    logOwnerPhase11C1DecisionFallback({
      selector,
      reason: 'PHASE11C1_DECISION_FALLBACK',
      field: 'incomingBan',
      banId: fallback.id,
    });
    compareIds11C1(selector, 'incomingBan', null, fallback.id);
  }
  return fallback;
}

export function readOwnerDecisionDisplayCheckBan(
  display: NotificationOwnerDisplayState,
  selector: OwnerDecisionReadSelector,
  legacy?: LegacyBanCompare,
): BanInteraction | null {
  const ownerBan = display.checkBan?.id ? display.checkBan : null;
  logOwnerPhase11C1DecisionRead({
    selector,
    field: 'checkBan',
    banId: ownerBan?.id ?? null,
  });
  if (legacy) {
    const legacyBan = legacy.state ?? legacy.ref ?? null;
    compareIds11C1(
      selector,
      'checkBan',
      ownerBan?.id ?? null,
      legacyBan?.id ?? null,
    );
  }
  return ownerBan;
}

export function readOwnerDecisionDisplayCheckBanWithLegacyFallback(
  display: NotificationOwnerDisplayState,
  selector: OwnerDecisionReadSelector,
  legacy: LegacyBanCompare,
): BanInteraction | null {
  const ownerBan = readOwnerDecisionDisplayCheckBan(display, selector, legacy);
  if (ownerBan) return ownerBan;
  const fallback = legacy.state ?? legacy.ref ?? null;
  if (fallback?.id) {
    logOwnerPhase11C1DecisionFallback({
      selector,
      reason: 'PHASE11C1_DECISION_FALLBACK',
      field: 'checkBan',
      banId: fallback.id,
    });
    compareIds11C1(selector, 'checkBan', null, fallback.id);
  }
  return fallback;
}

export function readOwnerDecisionDisplayResultBanId(
  display: NotificationOwnerDisplayState,
  selector: OwnerDecisionReadSelector,
  legacy?: LegacyBanCompare & { resultRef?: BanResult | null },
): string | null {
  const ownerResult = display.result?.id ? display.result : null;
  const ownerId = ownerResult?.id ? normalizeId(ownerResult.id) || null : null;
  logOwnerPhase11C1DecisionRead({
    selector,
    field: 'resultBanId',
    banId: ownerId,
  });
  if (legacy) {
    const legacyId =
      legacy.resultRef?.id ??
      (legacy.ref as BanResult | null | undefined)?.id ??
      legacy.state?.id ??
      null;
    compareIds11C1(
      selector,
      'resultBanId',
      ownerId,
      legacyId ? normalizeId(legacyId) || null : null,
    );
  }
  return ownerId;
}

export function readOwnerDecisionDisplayResultBanIdWithLegacyFallback(
  display: NotificationOwnerDisplayState,
  selector: OwnerDecisionReadSelector,
  legacy: LegacyBanCompare & { resultRef?: BanResult | null },
): string | null {
  const ownerId = readOwnerDecisionDisplayResultBanId(display, selector, legacy);
  if (ownerId) return ownerId;
  const fallback =
    legacy.resultRef?.id ??
    (legacy.ref as BanResult | null | undefined)?.id ??
    legacy.state?.id ??
    null;
  const norm = fallback ? normalizeId(fallback) || null : null;
  if (norm) {
    logOwnerPhase11C1DecisionFallback({
      selector,
      reason: 'PHASE11C1_DECISION_FALLBACK',
      field: 'resultBanId',
      banId: norm,
    });
    compareIds11C1(selector, 'resultBanId', null, norm);
  }
  return norm;
}

export function readOwnerDecisionMountedIncomingBan(
  display: NotificationOwnerDisplayState,
  selector: OwnerDecisionReadSelector,
  legacy: { stableRef?: BanInteraction | null; incomingRef?: BanInteraction | null },
): BanInteraction | null {
  const ownerStable = display.stableIncomingBan?.id
    ? display.stableIncomingBan
    : null;
  const ownerIncoming = display.incomingBan?.id ? display.incomingBan : null;
  const ownerBan = ownerStable ?? ownerIncoming;
  logOwnerPhase11C1DecisionRead({
    selector,
    field: 'mountedIncomingBan',
    banId: ownerBan?.id ?? null,
    stableBanId: ownerStable?.id ?? null,
  });
  const legacyStableId = legacy.stableRef?.id ?? null;
  const legacyIncomingId = legacy.incomingRef?.id ?? null;
  compareIds11C1(
    selector,
    'mountedIncomingStableBan',
    ownerStable?.id ?? null,
    legacyStableId,
  );
  compareIds11C1(
    selector,
    'mountedIncomingBan',
    ownerBan?.id ?? null,
    legacyStableId ?? legacyIncomingId,
  );
  if (ownerBan) return ownerBan;
  const fallback = legacy.stableRef ?? legacy.incomingRef ?? null;
  if (fallback?.id) {
    logOwnerPhase11C1DecisionFallback({
      selector,
      reason: 'PHASE11C1_DECISION_FALLBACK',
      field: 'mountedIncomingBan',
      banId: fallback.id,
    });
  }
  return fallback;
}

export function readOwnerDecisionHeldUserCard(
  owner: NotificationOverlayOwnerState,
  selector: OwnerDecisionReadSelector,
  legacy?: LegacyHeldCompare,
): HeldUserCardOverlay | null {
  const ownerHeld = owner.holds.userCard;
  logOwnerPhase11C1DecisionRead({
    selector,
    field: 'heldUserCard',
    kind: ownerHeld?.kind ?? null,
    banId: ownerHeld ? heldUserCardBanId(ownerHeld) : null,
  });
  if (legacy) {
    const legacyHeld = legacy.ref ?? null;
    compareIds11C1(
      selector,
      'heldUserCardKind',
      ownerHeld?.kind ?? null,
      legacyHeld?.kind ?? null,
    );
  }
  return ownerHeld;
}

export function readOwnerDecisionAtomicBanId(
  owner: NotificationOverlayOwnerState,
  selector: OwnerDecisionReadSelector,
  legacy?: LegacyStringCompare,
): string | null {
  const ownerId = owner.holds.atomicOverboardBanId
    ? normalizeId(owner.holds.atomicOverboardBanId) || null
    : null;
  logOwnerPhase11C1DecisionRead({
    selector,
    field: 'atomicOverboardBanId',
    banId: ownerId,
  });
  if (legacy) {
    compareIds11C1(
      selector,
      'atomicOverboardBanId',
      ownerId,
      legacy.ref ? normalizeId(legacy.ref) || null : null,
    );
  }
  return ownerId;
}

export function readOwnerDecisionOverboardInFlightBanId(
  owner: NotificationOverlayOwnerState,
  selector: OwnerDecisionReadSelector,
  legacy?: LegacyStringCompare,
): string | null {
  const ownerId = owner.holds.overboardInFlightBanId
    ? normalizeId(owner.holds.overboardInFlightBanId) || null
    : null;
  logOwnerPhase11C1DecisionRead({
    selector,
    field: 'overboardInFlightBanId',
    banId: ownerId,
  });
  if (legacy) {
    compareIds11C1(
      selector,
      'overboardInFlightBanId',
      ownerId,
      legacy.ref ? normalizeId(legacy.ref) || null : null,
    );
  }
  return ownerId;
}

export function readOwnerDecisionDirectOverlay(
  display: NotificationOwnerDisplayState,
  selector: OwnerDecisionReadSelector,
  legacy?: LegacyDirectResultCompare,
): boolean {
  const ownerOverlay = display.directResultOverlay;
  logOwnerPhase11C1DecisionRead({
    selector,
    field: 'directResultOverlay',
    value: ownerOverlay,
  });
  if (legacy) {
    compareBools11C1(
      selector,
      'directResultOverlay',
      ownerOverlay,
      legacy.overlayRef ?? false,
    );
  }
  return ownerOverlay;
}

export function readOwnerDecisionResultPriorityHas(
  owner: NotificationOverlayOwnerState,
  selector: OwnerDecisionReadSelector,
  banId: string,
  legacy?: { ref?: ReadonlySet<string> },
): boolean {
  const norm = normalizeId(banId) || banId;
  const ownerHas = owner.holds.resultPriorityBanIds.has(norm);
  logOwnerPhase11C1DecisionRead({
    selector,
    field: 'resultPriority',
    banId: norm,
    value: ownerHas,
  });
  if (legacy?.ref) {
    compareBools11C1(
      selector,
      'resultPriority',
      ownerHas,
      legacy.ref.has(norm),
    );
  }
  return ownerHas;
}

export type OwnerC2DecisionReadSelector =
  | 'syncDisplayFromQueue'
  | 'receiveResult'
  | 'checkAnswerFinalResult'
  | 'receiveCheckBan'
  | 'pendingChainPrefetch'
  | 'runChainLookaheadPrefetch'
  | 'deepLinkFastPath'
  | 'renderShellKind'
  | 'overboardInteractive'
  | 'lockOverkillTerminalPrune'
  | 'isQueueAtomicOverboardResultShowable'
  | 'isQueueResultShellVisibleContentReady'
  | 'checkResultShellDisplayReady'
  | 'shouldBlockAutoDismissAtomicOverboardResult';

function compareIds11C2(
  selector: OwnerC2DecisionReadSelector,
  field: string,
  ownerValue: string | null,
  legacyValue: string | null,
): void {
  if (ownerValue === legacyValue) return;
  logOwnerPhase11C2DecisionMismatch({
    selector,
    field,
    owner: ownerValue,
    legacy: legacyValue,
  });
}

function compareBools11C2(
  selector: OwnerC2DecisionReadSelector,
  field: string,
  ownerValue: boolean,
  legacyValue: boolean,
): void {
  if (ownerValue === legacyValue) return;
  logOwnerPhase11C2DecisionMismatch({
    selector,
    field,
    owner: ownerValue,
    legacy: legacyValue,
  });
}

function compareNumbers11C2(
  selector: OwnerC2DecisionReadSelector,
  field: string,
  ownerValue: number,
  legacyValue: number,
): void {
  if (ownerValue === legacyValue) return;
  logOwnerPhase11C2DecisionMismatch({
    selector,
    field,
    owner: ownerValue,
    legacy: legacyValue,
  });
}

/** Phase 11C.2: owner decision state snapshot read. */
export function readOwnerC2DecisionState(
  owner: NotificationOverlayOwnerState,
  selector: OwnerC2DecisionReadSelector,
): NotificationOverlayOwnerState {
  logOwnerPhase11C2DecisionRead({
    selector,
    field: 'state',
    queueLen: owner.queue.length,
    pendingLen: owner.pending.length,
  });
  return owner;
}

export function readOwnerC2AtomicBanId(
  owner: NotificationOverlayOwnerState,
  selector: OwnerC2DecisionReadSelector,
  legacy?: LegacyStringCompare,
): string | null {
  const ownerId = owner.holds.atomicOverboardBanId
    ? normalizeId(owner.holds.atomicOverboardBanId) || null
    : null;
  logOwnerPhase11C2DecisionRead({
    selector,
    field: 'atomicOverboardBanId',
    banId: ownerId,
  });
  if (legacy) {
    compareIds11C2(
      selector,
      'atomicOverboardBanId',
      ownerId,
      legacy.ref ? normalizeId(legacy.ref) || null : null,
    );
  }
  return ownerId;
}

export function readOwnerC2AtomicBanIdEquals(
  owner: NotificationOverlayOwnerState,
  selector: OwnerC2DecisionReadSelector,
  banId: string | null | undefined,
  legacy?: LegacyStringCompare,
): boolean {
  const ownerId = readOwnerC2AtomicBanId(owner, selector, legacy);
  const norm = banId ? normalizeId(banId) || banId : null;
  return ownerId === norm;
}

export function readOwnerC2OverboardInFlightBanId(
  owner: NotificationOverlayOwnerState,
  selector: OwnerC2DecisionReadSelector,
  legacy?: LegacyStringCompare,
): string | null {
  const ownerId = owner.holds.overboardInFlightBanId
    ? normalizeId(owner.holds.overboardInFlightBanId) || null
    : null;
  logOwnerPhase11C2DecisionRead({
    selector,
    field: 'overboardInFlightBanId',
    banId: ownerId,
  });
  if (legacy) {
    compareIds11C2(
      selector,
      'overboardInFlightBanId',
      ownerId,
      legacy.ref ? normalizeId(legacy.ref) || null : null,
    );
  }
  return ownerId;
}

export function readOwnerC2OverboardInFlightEquals(
  owner: NotificationOverlayOwnerState,
  selector: OwnerC2DecisionReadSelector,
  banId: string | null | undefined,
  legacy?: LegacyStringCompare,
): boolean {
  const ownerId = owner.holds.overboardInFlightBanId
    ? normalizeId(owner.holds.overboardInFlightBanId) || null
    : null;
  const norm = banId ? normalizeId(banId) || banId : null;
  logOwnerPhase11C2DecisionRead({
    selector,
    field: 'overboardInFlightBanId',
    banId: ownerId,
    equals: norm,
  });
  if (legacy) {
    compareIds11C2(
      selector,
      'overboardInFlightBanId',
      ownerId,
      legacy.ref ? normalizeId(legacy.ref) || null : null,
    );
  }
  return ownerId === norm;
}

export function readOwnerC2DisplayIncomingBan(
  display: NotificationOwnerDisplayState,
  selector: OwnerC2DecisionReadSelector,
  legacy?: LegacyBanCompare,
): BanInteraction | null {
  const ownerBan = display.incomingBan?.id ? display.incomingBan : null;
  logOwnerPhase11C2DecisionRead({
    selector,
    field: 'incomingBan',
    banId: ownerBan?.id ?? null,
  });
  if (legacy) {
    const legacyBan = legacy.state ?? legacy.ref ?? null;
    compareIds11C2(
      selector,
      'incomingBan',
      ownerBan?.id ?? null,
      legacyBan?.id ?? null,
    );
  }
  return ownerBan;
}

export function readOwnerC2DisplayIncomingBanWithLegacyFallback(
  display: NotificationOwnerDisplayState,
  selector: OwnerC2DecisionReadSelector,
  legacy: LegacyBanCompare,
): BanInteraction | null {
  const ownerBan = readOwnerC2DisplayIncomingBan(display, selector, legacy);
  if (ownerBan) return ownerBan;
  const fallback = legacy.state ?? legacy.ref ?? null;
  if (fallback?.id) {
    logOwnerPhase11C2DecisionFallback({
      selector,
      reason: 'PHASE11C2_DECISION_FALLBACK',
      field: 'incomingBan',
      banId: fallback.id,
    });
  }
  return fallback;
}

export function readOwnerC2DisplayResultBanId(
  display: NotificationOwnerDisplayState,
  selector: OwnerC2DecisionReadSelector,
  legacy?: LegacyBanCompare & { resultRef?: BanResult | null },
): string | null {
  const ownerResult = display.result?.id ? display.result : null;
  const ownerId = ownerResult?.id ? normalizeId(ownerResult.id) || null : null;
  logOwnerPhase11C2DecisionRead({
    selector,
    field: 'resultBanId',
    banId: ownerId,
  });
  if (legacy) {
    const legacyId =
      legacy.resultRef?.id ??
      (legacy.ref as BanResult | null | undefined)?.id ??
      legacy.state?.id ??
      null;
    compareIds11C2(
      selector,
      'resultBanId',
      ownerId,
      legacyId ? normalizeId(legacyId) || null : null,
    );
  }
  return ownerId;
}

export function readOwnerC2DisplayResultBanIdWithLegacyFallback(
  display: NotificationOwnerDisplayState,
  selector: OwnerC2DecisionReadSelector,
  legacy: LegacyBanCompare & { resultRef?: BanResult | null },
): string | null {
  const ownerId = readOwnerC2DisplayResultBanId(display, selector, legacy);
  if (ownerId) return ownerId;
  const fallback =
    legacy.resultRef?.id ??
    (legacy.ref as BanResult | null | undefined)?.id ??
    legacy.state?.id ??
    null;
  const norm = fallback ? normalizeId(fallback) || null : null;
  if (norm) {
    logOwnerPhase11C2DecisionFallback({
      selector,
      reason: 'PHASE11C2_DECISION_FALLBACK',
      field: 'resultBanId',
      banId: norm,
    });
  }
  return norm;
}

export function readOwnerC2DirectOverlay(
  display: NotificationOwnerDisplayState,
  selector: OwnerC2DecisionReadSelector,
  legacy?: LegacyDirectResultCompare,
): boolean {
  const ownerOverlay = display.directResultOverlay;
  logOwnerPhase11C2DecisionRead({
    selector,
    field: 'directResultOverlay',
    value: ownerOverlay,
  });
  if (legacy) {
    compareBools11C2(
      selector,
      'directResultOverlay',
      ownerOverlay,
      legacy.overlayRef ?? false,
    );
  }
  return ownerOverlay;
}

export function readOwnerC2ResultPriorityHas(
  owner: NotificationOverlayOwnerState,
  selector: OwnerC2DecisionReadSelector,
  banId: string,
  legacy?: { ref?: ReadonlySet<string> },
): boolean {
  const norm = normalizeId(banId) || banId;
  const ownerHas = owner.holds.resultPriorityBanIds.has(norm);
  logOwnerPhase11C2DecisionRead({
    selector,
    field: 'resultPriority',
    banId: norm,
    value: ownerHas,
  });
  if (legacy?.ref) {
    compareBools11C2(
      selector,
      'resultPriority',
      ownerHas,
      legacy.ref.has(norm),
    );
  }
  return ownerHas;
}

export function readOwnerC2QueueLengthChanged(
  owner: NotificationOverlayOwnerState,
  selector: OwnerC2DecisionReadSelector,
  nextLen: number,
  legacy?: LegacyQueueCompare,
): boolean {
  const ownerLen = owner.queue.length;
  logOwnerPhase11C2DecisionRead({
    selector,
    field: 'queueLength',
    ownerLen,
    nextLen,
  });
  if (legacy?.queueRef) {
    compareNumbers11C2(
      selector,
      'queueLength',
      ownerLen,
      legacy.queueRef.length,
    );
  }
  return nextLen !== ownerLen;
}

export function readOwnerC2PendingLengthChanged(
  owner: NotificationOverlayOwnerState,
  selector: OwnerC2DecisionReadSelector,
  nextLen: number,
  legacy?: LegacyPendingCompare,
): boolean {
  const ownerLen = owner.pending.length;
  logOwnerPhase11C2DecisionRead({
    selector,
    field: 'pendingLength',
    ownerLen,
    nextLen,
  });
  if (legacy?.pendingRef) {
    compareNumbers11C2(
      selector,
      'pendingLength',
      ownerLen,
      legacy.pendingRef.length,
    );
  }
  return nextLen !== ownerLen;
}

export type OwnerC3DecisionReadSelector =
  | 'pollPendingResultOnce'
  | 'pollIntervalGuard'
  | 'dismissBanResult'
  | 'showNextNotification'
  | 'replyTimerPath'
  | 'applyDirectOverboardClose'
  | 'finalizeResultForGoToBans'
  | 'navigateFromResult'
  | 'isHeldFinalStatusResultProtected'
  | 'blockAutoDismissTerminalFinalStatus'
  | 'deferPassiveResultQueueHeadOnLobby'
  | 'syncDisplayHeldOverboard'
  | 'syncDisplaySkipResultCta'
  | 'checkAnswerWaitingPartner'
  | 'checkAnswerSubmitFinally'
  | 'checkAnswerNextMounted'
  | 'checkAnswerWaitingForNext'
  | 'lobbyBansDrainEnter'
  | 'openLobbyBlockGuard'
  | 'chainTransitionLayoutEffect'
  | 'getActiveOverlaySnapshotForHoldTrace'
  | 'buildHoldOwnerScreenContext'
  | 'getActiveOverlaySnapshotForDiag'
  | 'snapshotFreshResultOverlayStack'
  | 'resultOpenTraceContext'
  | 'readDirectOverboardSnapshot'
  | 'forceOpenOverboardResult'
  | 'suppressStaleResultOverlay'
  | 'directOverboardLayerRenderCheck';

function compareIds11C3(
  selector: OwnerC3DecisionReadSelector,
  field: string,
  ownerValue: string | null,
  legacyValue: string | null,
): void {
  if (ownerValue === legacyValue) return;
  logOwnerPhase11C3DecisionMismatch({
    selector,
    field,
    owner: ownerValue,
    legacy: legacyValue,
  });
}

function compareBools11C3(
  selector: OwnerC3DecisionReadSelector,
  field: string,
  ownerValue: boolean,
  legacyValue: boolean,
): void {
  if (ownerValue === legacyValue) return;
  logOwnerPhase11C3DecisionMismatch({
    selector,
    field,
    owner: ownerValue,
    legacy: legacyValue,
  });
}

/** Phase 11C.3: owner decision state snapshot read. */
export function readOwnerC3DecisionState(
  owner: NotificationOverlayOwnerState,
  selector: OwnerC3DecisionReadSelector,
): NotificationOverlayOwnerState {
  logOwnerPhase11C3DecisionRead({
    selector,
    field: 'state',
    queueLen: owner.queue.length,
    pendingLen: owner.pending.length,
  });
  return owner;
}

export function readOwnerC3AtomicBanId(
  owner: NotificationOverlayOwnerState,
  selector: OwnerC3DecisionReadSelector,
  legacy?: LegacyStringCompare,
): string | null {
  const ownerId = owner.holds.atomicOverboardBanId
    ? normalizeId(owner.holds.atomicOverboardBanId) || null
    : null;
  logOwnerPhase11C3DecisionRead({
    selector,
    field: 'atomicOverboardBanId',
    banId: ownerId,
  });
  if (legacy) {
    compareIds11C3(
      selector,
      'atomicOverboardBanId',
      ownerId,
      legacy.ref ? normalizeId(legacy.ref) || null : null,
    );
  }
  return ownerId;
}

export function readOwnerC3AtomicBanIdEquals(
  owner: NotificationOverlayOwnerState,
  selector: OwnerC3DecisionReadSelector,
  banId: string | null | undefined,
  legacy?: LegacyStringCompare,
): boolean {
  const ownerId = readOwnerC3AtomicBanId(owner, selector, legacy);
  const norm = banId ? normalizeId(banId) || banId : null;
  return ownerId === norm;
}

export function readOwnerC3OverboardInFlightBanId(
  owner: NotificationOverlayOwnerState,
  selector: OwnerC3DecisionReadSelector,
  legacy?: LegacyStringCompare,
): string | null {
  const ownerId = owner.holds.overboardInFlightBanId
    ? normalizeId(owner.holds.overboardInFlightBanId) || null
    : null;
  logOwnerPhase11C3DecisionRead({
    selector,
    field: 'overboardInFlightBanId',
    banId: ownerId,
  });
  if (legacy) {
    compareIds11C3(
      selector,
      'overboardInFlightBanId',
      ownerId,
      legacy.ref ? normalizeId(legacy.ref) || null : null,
    );
  }
  return ownerId;
}

export function readOwnerC3OverboardInFlightEquals(
  owner: NotificationOverlayOwnerState,
  selector: OwnerC3DecisionReadSelector,
  banId: string | null | undefined,
  legacy?: LegacyStringCompare,
): boolean {
  const ownerId = readOwnerC3OverboardInFlightBanId(owner, selector, legacy);
  const norm = banId ? normalizeId(banId) || banId : null;
  return ownerId === norm;
}

export function readOwnerC3DisplayIncomingBan(
  display: NotificationOwnerDisplayState,
  selector: OwnerC3DecisionReadSelector,
  legacy?: LegacyBanCompare,
): BanInteraction | null {
  const ownerBan = display.incomingBan?.id ? display.incomingBan : null;
  logOwnerPhase11C3DecisionRead({
    selector,
    field: 'incomingBan',
    banId: ownerBan?.id ?? null,
  });
  if (legacy) {
    const legacyBan = legacy.state ?? legacy.ref ?? null;
    compareIds11C3(
      selector,
      'incomingBan',
      ownerBan?.id ?? null,
      legacyBan?.id ?? null,
    );
  }
  return ownerBan;
}

export function readOwnerC3DisplayIncomingBanWithLegacyFallback(
  display: NotificationOwnerDisplayState,
  selector: OwnerC3DecisionReadSelector,
  legacy: LegacyBanCompare,
): BanInteraction | null {
  const ownerBan = readOwnerC3DisplayIncomingBan(display, selector, legacy);
  if (ownerBan) return ownerBan;
  const fallback = legacy.state ?? legacy.ref ?? null;
  if (fallback?.id) {
    logOwnerPhase11C3DecisionFallback({
      selector,
      reason: 'PHASE11C3_DECISION_FALLBACK',
      field: 'incomingBan',
      banId: fallback.id,
    });
  }
  return fallback;
}

export function readOwnerC3DisplayIncomingBanIdEquals(
  display: NotificationOwnerDisplayState,
  selector: OwnerC3DecisionReadSelector,
  banId: string | null | undefined,
  legacy: LegacyBanCompare,
): boolean {
  const ownerBan = readOwnerC3DisplayIncomingBan(
    display,
    selector,
    legacy,
  );
  const norm = banId ? normalizeId(banId) || banId : null;
  return ownerBan?.id ? normalizeId(ownerBan.id) === norm : false;
}

export function readOwnerC3DisplayResultBanId(
  display: NotificationOwnerDisplayState,
  selector: OwnerC3DecisionReadSelector,
  legacy?: LegacyBanCompare & { resultRef?: BanResult | null },
): string | null {
  const ownerResult = display.result?.id ? display.result : null;
  const ownerId = ownerResult?.id ? normalizeId(ownerResult.id) || null : null;
  logOwnerPhase11C3DecisionRead({
    selector,
    field: 'resultBanId',
    banId: ownerId,
  });
  if (legacy) {
    const legacyId =
      legacy.resultRef?.id ??
      (legacy.ref as BanResult | null | undefined)?.id ??
      legacy.state?.id ??
      null;
    compareIds11C3(
      selector,
      'resultBanId',
      ownerId,
      legacyId ? normalizeId(legacyId) || null : null,
    );
  }
  return ownerId;
}

export function readOwnerC3DisplayResultBanIdWithLegacyFallback(
  display: NotificationOwnerDisplayState,
  selector: OwnerC3DecisionReadSelector,
  legacy: LegacyBanCompare & { resultRef?: BanResult | null },
): string | null {
  const ownerId = readOwnerC3DisplayResultBanId(display, selector, legacy);
  if (ownerId) return ownerId;
  const fallback =
    legacy.resultRef?.id ??
    (legacy.ref as BanResult | null | undefined)?.id ??
    legacy.state?.id ??
    null;
  const norm = fallback ? normalizeId(fallback) || null : null;
  if (norm) {
    logOwnerPhase11C3DecisionFallback({
      selector,
      reason: 'PHASE11C3_DECISION_FALLBACK',
      field: 'resultBanId',
      banId: norm,
    });
  }
  return norm;
}

export function readOwnerC3DisplayResult(
  display: NotificationOwnerDisplayState,
  selector: OwnerC3DecisionReadSelector,
  legacy: LegacyBanCompare & { resultRef?: BanResult | null },
): BanResult | null {
  const ownerResult = display.result?.id ? display.result : null;
  logOwnerPhase11C3DecisionRead({
    selector,
    field: 'result',
    banId: ownerResult?.id ?? null,
  });
  if (legacy) {
    const legacyId =
      legacy.resultRef?.id ??
      (legacy.ref as BanResult | null | undefined)?.id ??
      null;
    compareIds11C3(
      selector,
      'result',
      ownerResult?.id ?? null,
      legacyId ?? null,
    );
  }
  if (ownerResult) return ownerResult;
  return null;
}

export function readOwnerC3DirectOverlay(
  display: NotificationOwnerDisplayState,
  selector: OwnerC3DecisionReadSelector,
  legacy?: LegacyDirectResultCompare,
): boolean {
  const ownerOverlay = display.directResultOverlay;
  logOwnerPhase11C3DecisionRead({
    selector,
    field: 'directResultOverlay',
    value: ownerOverlay,
  });
  if (legacy) {
    compareBools11C3(
      selector,
      'directResultOverlay',
      ownerOverlay,
      legacy.overlayRef ?? false,
    );
  }
  return ownerOverlay;
}

export function readOwnerC3DirectOverlayActive(
  display: NotificationOwnerDisplayState,
  selector: OwnerC3DecisionReadSelector,
  legacy?: { activeRef?: boolean; stateActive?: boolean },
): boolean {
  const ownerActive = display.directResultOverlayActive;
  logOwnerPhase11C3DecisionRead({
    selector,
    field: 'directResultOverlayActive',
    value: ownerActive,
  });
  if (legacy) {
    const legacyActive = legacy.activeRef ?? legacy.stateActive ?? false;
    compareBools11C3(
      selector,
      'directResultOverlayActive',
      ownerActive,
      legacyActive,
    );
  }
  return ownerActive;
}

export function readOwnerC3IsDirectOverboardLayerActive(
  display: NotificationOwnerDisplayState,
  selector: OwnerC3DecisionReadSelector,
  legacy?: LegacyDirectResultCompare & { stateActive?: boolean },
): boolean {
  const ownerAny =
    display.directResultOverlay || display.directResultOverlayActive;
  logOwnerPhase11C3DecisionRead({
    selector,
    field: 'isDirectOverboardLayerActive',
    value: ownerAny,
  });
  if (legacy) {
    const legacyAny =
      (legacy.overlayRef ?? false) ||
      (legacy.activeRef ?? false) ||
      (legacy.stateActive ?? false);
    compareBools11C3(
      selector,
      'isDirectOverboardLayerActive',
      ownerAny,
      legacyAny,
    );
  }
  return ownerAny;
}

export function readOwnerC3HasMountedResult(
  display: NotificationOwnerDisplayState,
  selector: OwnerC3DecisionReadSelector,
  legacy: LegacyBanCompare & { resultRef?: BanResult | null },
): boolean {
  const banId = readOwnerC3DisplayResultBanId(
    display,
    selector,
    legacy,
  );
  return Boolean(banId);
}
