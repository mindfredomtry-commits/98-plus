'use client';

import type { QueuedOverlay } from '@/lib/overlay-queue';
import { overlayBanId } from '@/lib/overlay-queue';
import { normalizeId } from '@/lib/normalize-json';
import {
  logOwnerPhase11B6ShellFallback,
  logOwnerPhase11B6ShellMismatch,
  logOwnerPhase11B6ShellRead,
} from '@/lib/notification-overlay-owner-debug';

export type OwnerShellReadSelector =
  | 'activeOverlayKind'
  | 'queueHeadKind'
  | 'queueShellKind'
  | 'effectiveNotificationQueueShellKind'
  | 'incomingNotificationShellKind'
  | 'notificationOverlayVisible'
  | 'notificationOverlayMounted'
  | 'shouldMountNotificationOverlayHost'
  | 'hasQueuedOverlayShell'
  | 'notificationSessionActive'
  | 'GlobalOverlayHost'
  | 'NotificationQueueShell'
  | 'renderTrace';

export type OverlayShellKind = 'incoming' | 'check' | 'result' | null;

type LegacyQueueCompare = {
  queue: readonly QueuedOverlay[];
  refQueue: readonly QueuedOverlay[];
};

type LegacyQueueLenCompare = {
  state: number;
  ref: number;
};

function queueHeadKindFrom(queue: readonly QueuedOverlay[]): OverlayShellKind {
  return queue[0]?.kind ?? null;
}

function legacyQueueHeadKind(legacy: LegacyQueueCompare): OverlayShellKind {
  return queueHeadKindFrom(legacy.queue) ?? queueHeadKindFrom(legacy.refQueue);
}

function compareShellKinds11B6(
  selector: OwnerShellReadSelector,
  field: string,
  ownerValue: OverlayShellKind,
  legacyValue: OverlayShellKind,
): void {
  if (ownerValue === legacyValue) return;
  logOwnerPhase11B6ShellMismatch({
    selector,
    field,
    owner: ownerValue,
    legacy: legacyValue,
  });
}

function compareShellNumbers11B6(
  selector: OwnerShellReadSelector,
  field: string,
  ownerValue: number,
  legacyValue: number,
): void {
  if (ownerValue === legacyValue) return;
  logOwnerPhase11B6ShellMismatch({
    selector,
    field,
    owner: ownerValue,
    legacy: legacyValue,
  });
}

/** Phase 11B.6: owner-only queue head kind for shell/mount decisions. */
export function readOwnerOnlyShellQueueHeadKind(
  ownerQueue: readonly QueuedOverlay[],
  selector: OwnerShellReadSelector,
  legacy?: LegacyQueueCompare,
): OverlayShellKind {
  const ownerKind = queueHeadKindFrom(ownerQueue);
  logOwnerPhase11B6ShellRead({
    selector,
    field: 'queueHeadKind',
    kind: ownerKind,
  });
  if (legacy) {
    compareShellKinds11B6(selector, 'queueHeadKind', ownerKind, legacyQueueHeadKind(legacy));
  }
  return ownerKind;
}

/** Explicit transitional fallback — log and surface mismatch when used. */
export function readOwnerShellQueueHeadKindWithLegacyFallback(
  ownerQueue: readonly QueuedOverlay[],
  legacy: LegacyQueueCompare,
  selector: OwnerShellReadSelector,
  reason: string,
): OverlayShellKind {
  const ownerKind = readOwnerOnlyShellQueueHeadKind(ownerQueue, selector, legacy);
  if (ownerKind) return ownerKind;
  const fallback = legacyQueueHeadKind(legacy);
  if (fallback) {
    logOwnerPhase11B6ShellFallback({
      selector,
      reason,
      field: 'queueHeadKind',
      kind: fallback,
    });
    compareShellKinds11B6(selector, 'queueHeadKind', null, fallback);
  }
  return fallback;
}

/** Phase 11B.6: owner-only queue length for shell/mount/session decisions. */
export function readOwnerOnlyShellQueueLen(
  ownerQueueLen: number,
  selector: OwnerShellReadSelector,
  legacy?: LegacyQueueLenCompare,
): number {
  logOwnerPhase11B6ShellRead({
    selector,
    field: 'queueLen',
    value: ownerQueueLen,
  });
  if (legacy) {
    compareShellNumbers11B6(
      selector,
      'queueLen',
      ownerQueueLen,
      legacy.state ?? legacy.ref,
    );
  }
  return ownerQueueLen;
}

/** Phase 11B.6: owner-only pending length for shell/session decisions. */
export function readOwnerOnlyShellPendingLen(
  ownerPendingLen: number,
  selector: OwnerShellReadSelector,
  legacy?: LegacyQueueLenCompare,
): number {
  logOwnerPhase11B6ShellRead({
    selector,
    field: 'pendingLen',
    value: ownerPendingLen,
  });
  if (legacy) {
    compareShellNumbers11B6(
      selector,
      'pendingLen',
      ownerPendingLen,
      legacy.state ?? legacy.ref,
    );
  }
  return ownerPendingLen;
}

/** Phase 11B.6: resolve active overlay kind from owner shell inputs. */
export function resolveOwnerShellActiveOverlayKind(
  selector: OwnerShellReadSelector,
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
  logOwnerPhase11B6ShellRead({
    selector,
    field: 'activeOverlayKind',
    kind,
  });
  return kind;
}

/** Phase 11B.6: incoming queue-head ban id from owner queue head. */
export function readOwnerOnlyShellQueueHeadIncomingBanId(
  ownerQueueHead: QueuedOverlay | null,
  selector: OwnerShellReadSelector,
  legacy?: LegacyQueueCompare,
): string | null {
  const ownerId =
    ownerQueueHead?.kind === 'incoming'
      ? normalizeId(ownerQueueHead.ban.id) || null
      : null;
  logOwnerPhase11B6ShellRead({
    selector,
    field: 'queueHeadIncomingBanId',
    banId: ownerId,
  });
  if (legacy) {
    const legacyHead =
      legacy.queue[0] ?? legacy.refQueue[0] ?? null;
    const legacyId =
      legacyHead?.kind === 'incoming'
        ? normalizeId(legacyHead.ban.id) || null
        : null;
    if (ownerId !== legacyId) {
      logOwnerPhase11B6ShellMismatch({
        selector,
        field: 'queueHeadIncomingBanId',
        owner: ownerId,
        legacy: legacyId,
      });
    }
  }
  return ownerId;
}

/** Explicit transitional fallback for queue-head incoming ban id. */
export function readOwnerShellQueueHeadIncomingBanIdWithLegacyFallback(
  ownerQueueHead: QueuedOverlay | null,
  legacy: LegacyQueueCompare,
  selector: OwnerShellReadSelector,
  reason: string,
): string | null {
  const ownerId = readOwnerOnlyShellQueueHeadIncomingBanId(
    ownerQueueHead,
    selector,
    legacy,
  );
  if (ownerId) return ownerId;
  const legacyHead = legacy.queue[0] ?? legacy.refQueue[0] ?? null;
  const fallbackId =
    legacyHead?.kind === 'incoming'
      ? normalizeId(overlayBanId(legacyHead)) || null
      : null;
  if (fallbackId) {
    logOwnerPhase11B6ShellFallback({
      selector,
      reason,
      field: 'queueHeadIncomingBanId',
      banId: fallbackId,
    });
    logOwnerPhase11B6ShellMismatch({
      selector,
      field: 'queueHeadIncomingBanId',
      owner: null,
      legacy: fallbackId,
    });
  }
  return fallbackId;
}
