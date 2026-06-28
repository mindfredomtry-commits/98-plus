'use client';

import type { BanInteraction, BanResult } from '@98plus/shared';
import type { QueuedOverlay } from '@/lib/overlay-queue';
import { overlayBanId } from '@/lib/overlay-queue';
import { normalizeId } from '@/lib/normalize-json';
import type {
  NotificationOverlayOwnerState,
  NotificationOwnerDisplayState,
} from '@/lib/notification-overlay-owner';
import type { HeldUserCardOverlay } from '@/lib/overlay-user-card-guard';
import { heldUserCardBanId } from '@/lib/overlay-user-card-guard';
import {
  logOwnerPhase11B7ImperativeFallback,
  logOwnerPhase11B7ImperativeMismatch,
  logOwnerPhase11B7ImperativeRead,
} from '@/lib/notification-overlay-owner-debug';

export type OwnerImperativeReadSelector =
  | 'dismissCurrentOverlay'
  | 'syncDisplayFromQueue'
  | 'showNextNotificationFromChainSync'
  | 'clearActiveOverlayStateForDismiss'
  | 'preserveAtomicOverboardResultDuringSync'
  | 'blockClearActiveIncomingOverlayBan'
  | 'resolveStableIncomingForQueueHead'
  | 'captureActiveUserCardHold'
  | 'restoreHeldUserCardOverlay'
  | 'blockAndPreserveActiveUserCard'
  | 'clearStaleUserCardHoldForNextHead'
  | 'clearActiveUserCardHold'
  | 'isActiveUserCardHold'
  | 'resolveMountedResultPayloadForBanId'
  | 'shouldBlockAutoDismissAtomicOverboardResult'
  | 'isInteractiveOverboardResultBanId'
  | 'holdResultForActiveNotificationChain'
  | 'buildResultShellHeldCardGuardContext'
  | 'scheduleReplyFastTimeout'
  | 'ensureReplyFastIncomingAtHead'
  | 'chainContinue'
  | 'deepLinkCallback'
  | 'timerCallback'
  | 'resultOverboardCallback'
  | 'queueHelper'
  | 'renderIndependentGuard';

type LegacyQueueCompare = {
  queueRef?: readonly QueuedOverlay[];
};

type LegacyPendingCompare = {
  pendingRef?: readonly QueuedOverlay[];
};

type LegacyBanCompare = {
  ref?: BanInteraction | null;
};

type LegacyResultCompare = {
  ref?: BanResult | null;
};

type LegacyHeldCompare = {
  ref?: HeldUserCardOverlay | null;
};

type LegacyStringCompare = {
  ref?: string | null;
};

type LegacyBoolCompare = {
  ref?: boolean;
};

function compareIds11B7(
  selector: OwnerImperativeReadSelector,
  field: string,
  ownerValue: string | null,
  legacyValue: string | null,
): void {
  if (ownerValue === legacyValue) return;
  logOwnerPhase11B7ImperativeMismatch({
    selector,
    field,
    owner: ownerValue,
    legacy: legacyValue,
  });
}

function compareKinds11B7(
  selector: OwnerImperativeReadSelector,
  field: string,
  ownerValue: string | null,
  legacyValue: string | null,
): void {
  if (ownerValue === legacyValue) return;
  logOwnerPhase11B7ImperativeMismatch({
    selector,
    field,
    owner: ownerValue,
    legacy: legacyValue,
  });
}

function compareNumbers11B7(
  selector: OwnerImperativeReadSelector,
  field: string,
  ownerValue: number,
  legacyValue: number,
): void {
  if (ownerValue === legacyValue) return;
  logOwnerPhase11B7ImperativeMismatch({
    selector,
    field,
    owner: ownerValue,
    legacy: legacyValue,
  });
}

function compareBools11B7(
  selector: OwnerImperativeReadSelector,
  field: string,
  ownerValue: boolean,
  legacyValue: boolean,
): void {
  if (ownerValue === legacyValue) return;
  logOwnerPhase11B7ImperativeMismatch({
    selector,
    field,
    owner: ownerValue,
    legacy: legacyValue,
  });
}

/** Phase 11B.7: owner imperative state snapshot read. */
export function readOwnerImperativeState(
  owner: NotificationOverlayOwnerState,
  selector: OwnerImperativeReadSelector,
): NotificationOverlayOwnerState {
  logOwnerPhase11B7ImperativeRead({
    selector,
    field: 'state',
    queueLen: owner.queue.length,
    pendingLen: owner.pending.length,
  });
  return owner;
}

/** Phase 11B.7: owner-only queue head for imperative decisions. */
export function readOwnerImperativeQueueHead(
  owner: NotificationOverlayOwnerState,
  selector: OwnerImperativeReadSelector,
  legacy?: LegacyQueueCompare,
): QueuedOverlay | null {
  const ownerHead = owner.queue[0] ?? null;
  logOwnerPhase11B7ImperativeRead({
    selector,
    field: 'queueHead',
    kind: ownerHead?.kind ?? null,
    banId: ownerHead ? normalizeId(overlayBanId(ownerHead)) || null : null,
  });
  if (legacy?.queueRef) {
    const legacyHead = legacy.queueRef[0] ?? null;
    compareKinds11B7(
      selector,
      'queueHeadKind',
      ownerHead?.kind ?? null,
      legacyHead?.kind ?? null,
    );
    compareIds11B7(
      selector,
      'queueHeadBanId',
      ownerHead ? normalizeId(overlayBanId(ownerHead)) || null : null,
      legacyHead ? normalizeId(overlayBanId(legacyHead)) || null : null,
    );
  }
  return ownerHead;
}

export function readOwnerImperativeQueueHeadWithLegacyFallback(
  owner: NotificationOverlayOwnerState,
  selector: OwnerImperativeReadSelector,
  legacy: LegacyQueueCompare,
  reason: string,
): QueuedOverlay | null {
  const ownerHead = readOwnerImperativeQueueHead(owner, selector, legacy);
  if (ownerHead) return ownerHead;
  const fallback = legacy.queueRef?.[0] ?? null;
  if (fallback) {
    logOwnerPhase11B7ImperativeFallback({
      selector,
      reason,
      field: 'queueHead',
      kind: fallback.kind,
      banId: normalizeId(overlayBanId(fallback)) || null,
    });
    compareKinds11B7(selector, 'queueHeadKind', null, fallback.kind);
  }
  return fallback;
}

export function readOwnerImperativeQueueLen(
  owner: NotificationOverlayOwnerState,
  selector: OwnerImperativeReadSelector,
  legacy?: LegacyQueueCompare,
): number {
  const ownerLen = owner.queue.length;
  logOwnerPhase11B7ImperativeRead({
    selector,
    field: 'queueLen',
    value: ownerLen,
  });
  if (legacy?.queueRef) {
    compareNumbers11B7(selector, 'queueLen', ownerLen, legacy.queueRef.length);
  }
  return ownerLen;
}

export function readOwnerImperativePendingLen(
  owner: NotificationOverlayOwnerState,
  selector: OwnerImperativeReadSelector,
  legacy?: LegacyPendingCompare,
): number {
  const ownerLen = owner.pending.length;
  logOwnerPhase11B7ImperativeRead({
    selector,
    field: 'pendingLen',
    value: ownerLen,
  });
  if (legacy?.pendingRef) {
    compareNumbers11B7(selector, 'pendingLen', ownerLen, legacy.pendingRef.length);
  }
  return ownerLen;
}

export function readOwnerImperativePendingHead(
  owner: NotificationOverlayOwnerState,
  selector: OwnerImperativeReadSelector,
  legacy?: LegacyPendingCompare,
): QueuedOverlay | null {
  const ownerHead = owner.pending[0] ?? null;
  logOwnerPhase11B7ImperativeRead({
    selector,
    field: 'pendingHead',
    kind: ownerHead?.kind ?? null,
    banId: ownerHead ? normalizeId(overlayBanId(ownerHead)) || null : null,
  });
  if (legacy?.pendingRef) {
    const legacyHead = legacy.pendingRef[0] ?? null;
    compareKinds11B7(
      selector,
      'pendingHeadKind',
      ownerHead?.kind ?? null,
      legacyHead?.kind ?? null,
    );
  }
  return ownerHead;
}

export function readOwnerImperativeIncomingBan(
  display: NotificationOwnerDisplayState,
  selector: OwnerImperativeReadSelector,
  legacy?: LegacyBanCompare,
): BanInteraction | null {
  const ownerBan = display.incomingBan?.id ? display.incomingBan : null;
  logOwnerPhase11B7ImperativeRead({
    selector,
    field: 'incomingBan',
    banId: ownerBan?.id ?? null,
  });
  if (legacy) {
    compareIds11B7(
      selector,
      'incomingBan',
      ownerBan?.id ?? null,
      legacy.ref?.id ?? null,
    );
  }
  return ownerBan;
}

export function readOwnerImperativeIncomingBanWithLegacyFallback(
  display: NotificationOwnerDisplayState,
  selector: OwnerImperativeReadSelector,
  legacy: LegacyBanCompare,
  reason: string,
): BanInteraction | null {
  const ownerBan = readOwnerImperativeIncomingBan(display, selector, legacy);
  if (ownerBan) return ownerBan;
  const fallback = legacy.ref ?? null;
  if (fallback?.id) {
    logOwnerPhase11B7ImperativeFallback({
      selector,
      reason,
      field: 'incomingBan',
      banId: fallback.id,
    });
    compareIds11B7(selector, 'incomingBan', null, fallback.id);
  }
  return fallback;
}

export function readOwnerImperativeCheckBan(
  display: NotificationOwnerDisplayState,
  selector: OwnerImperativeReadSelector,
  legacy?: LegacyBanCompare,
): BanInteraction | null {
  const ownerBan = display.checkBan?.id ? display.checkBan : null;
  logOwnerPhase11B7ImperativeRead({
    selector,
    field: 'checkBan',
    banId: ownerBan?.id ?? null,
  });
  if (legacy) {
    compareIds11B7(
      selector,
      'checkBan',
      ownerBan?.id ?? null,
      legacy.ref?.id ?? null,
    );
  }
  return ownerBan;
}

export function readOwnerImperativeCheckBanWithLegacyFallback(
  display: NotificationOwnerDisplayState,
  selector: OwnerImperativeReadSelector,
  legacy: LegacyBanCompare,
  reason: string,
): BanInteraction | null {
  const ownerBan = readOwnerImperativeCheckBan(display, selector, legacy);
  if (ownerBan) return ownerBan;
  const fallback = legacy.ref ?? null;
  if (fallback?.id) {
    logOwnerPhase11B7ImperativeFallback({
      selector,
      reason,
      field: 'checkBan',
      banId: fallback.id,
    });
    compareIds11B7(selector, 'checkBan', null, fallback.id);
  }
  return fallback;
}

export function readOwnerImperativeResult(
  display: NotificationOwnerDisplayState,
  selector: OwnerImperativeReadSelector,
  legacy?: LegacyResultCompare,
): BanResult | null {
  const ownerResult = display.result?.id ? display.result : null;
  logOwnerPhase11B7ImperativeRead({
    selector,
    field: 'result',
    banId: ownerResult?.id ?? null,
  });
  if (legacy) {
    compareIds11B7(
      selector,
      'result',
      ownerResult?.id ?? null,
      legacy.ref?.id ?? null,
    );
  }
  return ownerResult;
}

export function readOwnerImperativeResultWithLegacyFallback(
  display: NotificationOwnerDisplayState,
  selector: OwnerImperativeReadSelector,
  legacy: LegacyResultCompare,
  reason: string,
): BanResult | null {
  const ownerResult = readOwnerImperativeResult(display, selector, legacy);
  if (ownerResult) return ownerResult;
  const fallback = legacy.ref ?? null;
  if (fallback?.id) {
    logOwnerPhase11B7ImperativeFallback({
      selector,
      reason,
      field: 'result',
      banId: fallback.id,
    });
    compareIds11B7(selector, 'result', null, fallback.id);
  }
  return fallback;
}

export function readOwnerImperativeStableIncomingBan(
  display: NotificationOwnerDisplayState,
  selector: OwnerImperativeReadSelector,
  legacy?: LegacyBanCompare,
): BanInteraction | null {
  const ownerBan = display.stableIncomingBan?.id ? display.stableIncomingBan : null;
  logOwnerPhase11B7ImperativeRead({
    selector,
    field: 'stableIncomingBan',
    banId: ownerBan?.id ?? null,
  });
  if (legacy) {
    compareIds11B7(
      selector,
      'stableIncomingBan',
      ownerBan?.id ?? null,
      legacy.ref?.id ?? null,
    );
  }
  return ownerBan;
}

export function readOwnerImperativeHeldUserCard(
  owner: NotificationOverlayOwnerState,
  selector: OwnerImperativeReadSelector,
  legacy?: LegacyHeldCompare,
): HeldUserCardOverlay | null {
  const ownerHeld = owner.holds.userCard;
  logOwnerPhase11B7ImperativeRead({
    selector,
    field: 'heldUserCard',
    kind: ownerHeld?.kind ?? null,
    banId: ownerHeld ? heldUserCardBanId(ownerHeld) : null,
  });
  if (legacy) {
    const legacyHeld = legacy.ref ?? null;
    compareKinds11B7(
      selector,
      'heldUserCardKind',
      ownerHeld?.kind ?? null,
      legacyHeld?.kind ?? null,
    );
    compareIds11B7(
      selector,
      'heldUserCardBanId',
      ownerHeld ? heldUserCardBanId(ownerHeld) : null,
      legacyHeld ? heldUserCardBanId(legacyHeld) : null,
    );
  }
  return ownerHeld;
}

export function readOwnerImperativeAtomicOverboardBanId(
  owner: NotificationOverlayOwnerState,
  selector: OwnerImperativeReadSelector,
  legacy?: LegacyStringCompare,
): string | null {
  const ownerId = owner.holds.atomicOverboardBanId
    ? normalizeId(owner.holds.atomicOverboardBanId) || null
    : null;
  logOwnerPhase11B7ImperativeRead({
    selector,
    field: 'atomicOverboardBanId',
    banId: ownerId,
  });
  if (legacy) {
    compareIds11B7(
      selector,
      'atomicOverboardBanId',
      ownerId,
      legacy.ref ? normalizeId(legacy.ref) || null : null,
    );
  }
  return ownerId;
}

export function readOwnerImperativeOverboardInFlightBanId(
  owner: NotificationOverlayOwnerState,
  selector: OwnerImperativeReadSelector,
  legacy?: LegacyStringCompare,
): string | null {
  const ownerId = owner.holds.overboardInFlightBanId
    ? normalizeId(owner.holds.overboardInFlightBanId) || null
    : null;
  logOwnerPhase11B7ImperativeRead({
    selector,
    field: 'overboardInFlightBanId',
    banId: ownerId,
  });
  if (legacy) {
    compareIds11B7(
      selector,
      'overboardInFlightBanId',
      ownerId,
      legacy.ref ? normalizeId(legacy.ref) || null : null,
    );
  }
  return ownerId;
}

export function readOwnerImperativeDirectResultOverlayActive(
  display: NotificationOwnerDisplayState,
  selector: OwnerImperativeReadSelector,
  legacy?: LegacyBoolCompare,
): boolean {
  const ownerActive = display.directResultOverlayActive;
  logOwnerPhase11B7ImperativeRead({
    selector,
    field: 'directResultOverlayActive',
    value: ownerActive,
  });
  if (legacy) {
    compareBools11B7(
      selector,
      'directResultOverlayActive',
      ownerActive,
      legacy.ref ?? false,
    );
  }
  return ownerActive;
}
