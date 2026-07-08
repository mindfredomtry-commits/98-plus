'use client';

import type { BanInteraction, BanResult } from '@98plus/shared';
import type { QueuedOverlay } from '@/lib/overlay-queue';
import { overlayBanId } from '@/lib/overlay-queue';
import { normalizeId } from '@/lib/normalize-json';
import { traceQueueHeadNullReadSite } from '@/lib/queue-head-lifecycle-trace-debug';
import type { NotificationOwnerDisplayState } from '@/lib/notification-overlay-owner';
import {
  logOwnerPhase10AReadFallback,
  logOwnerPhase10AReadOwner,
  logOwnerPhase10BFallbackRemains,
  logOwnerPhase10BOwnerRead,
  logOwnerPhase10BReadMismatch,
} from '@/lib/notification-overlay-owner-debug';

export type OwnerReadSelector =
  | 'incomingBan'
  | 'checkBan'
  | 'result'
  | 'directResultOverlay'
  | 'directResultOverlayActive'
  | 'queueHead'
  | 'queueLen'
  | 'pendingLen'
  | 'incomingCardDisplayBan'
  | 'activeResultPayload'
  | 'effectiveNotificationQueueShellKind'
  | 'notificationOverlayVisible'
  | 'GlobalOverlayHost'
  | 'NotificationQueueShell'
  | 'IncomingBanOverlay'
  | 'CheckOverlay'
  | 'ResultOverlay';

type LegacyIncomingCompare = {
  ref: BanInteraction | null;
  state: BanInteraction | null;
};

type LegacyResultCompare = {
  ref: BanResult | null;
  state: BanResult | null;
};

type LegacyDirectActiveCompare = {
  ref: boolean;
  state: boolean;
};

type LegacyQueueHeadCompare = {
  queue: readonly QueuedOverlay[];
  refQueue: readonly QueuedOverlay[];
};

function compareReadIds10B(
  selector: OwnerReadSelector,
  field: string,
  ownerValue: string | null | undefined,
  legacyValue: string | null | undefined,
): void {
  const ownerNorm = ownerValue ? normalizeId(ownerValue) || null : null;
  const legacyNorm = legacyValue ? normalizeId(legacyValue) || null : null;
  if (ownerNorm === legacyNorm) return;
  logOwnerPhase10BReadMismatch({
    selector,
    field,
    owner: ownerNorm,
    legacy: legacyNorm,
  });
}

function compareReadBool10B(
  selector: OwnerReadSelector,
  field: string,
  ownerValue: boolean,
  legacyValue: boolean,
): void {
  if (ownerValue === legacyValue) return;
  logOwnerPhase10BReadMismatch({
    selector,
    field,
    owner: ownerValue,
    legacy: legacyValue,
  });
}

function compareReadNumber10B(
  selector: OwnerReadSelector,
  field: string,
  ownerValue: number,
  legacyValue: number,
): void {
  if (ownerValue === legacyValue) return;
  logOwnerPhase10BReadMismatch({
    selector,
    field,
    owner: ownerValue,
    legacy: legacyValue,
  });
}

/** Phase 10B: owner-only read — legacy args used for shadow mismatch logging only. */
export function readOwnerOnlyIncomingBan(
  display: NotificationOwnerDisplayState,
  selector: OwnerReadSelector,
  legacy?: LegacyIncomingCompare,
): BanInteraction | null {
  const ownerBan = display.incomingBan?.id ? display.incomingBan : null;
  logOwnerPhase10BOwnerRead({
    selector,
    field: 'incomingBan',
    banId: ownerBan?.id ?? null,
  });
  if (legacy) {
    compareReadIds10B(
      selector,
      'incomingBan',
      ownerBan?.id,
      legacy.state?.id ?? legacy.ref?.id,
    );
  }
  return ownerBan;
}

/** Phase 10B: owner-only read — legacy args used for shadow mismatch logging only. */
export function readOwnerOnlyCheckBan(
  display: NotificationOwnerDisplayState,
  selector: OwnerReadSelector,
  legacy?: LegacyIncomingCompare,
): BanInteraction | null {
  const ownerBan = display.checkBan?.id ? display.checkBan : null;
  logOwnerPhase10BOwnerRead({
    selector,
    field: 'checkBan',
    banId: ownerBan?.id ?? null,
  });
  if (legacy) {
    compareReadIds10B(
      selector,
      'checkBan',
      ownerBan?.id,
      legacy.state?.id ?? legacy.ref?.id,
    );
  }
  return ownerBan;
}

/** Phase 10B: owner-only read — legacy args used for shadow mismatch logging only. */
export function readOwnerOnlyResult(
  display: NotificationOwnerDisplayState,
  selector: OwnerReadSelector,
  legacy?: LegacyResultCompare,
): BanResult | null {
  const ownerResult = display.result?.id ? display.result : null;
  logOwnerPhase10BOwnerRead({
    selector,
    field: 'result',
    banId: ownerResult?.id ?? null,
  });
  if (legacy) {
    compareReadIds10B(
      selector,
      'result',
      ownerResult?.id,
      legacy.state?.id ?? legacy.ref?.id,
    );
  }
  return ownerResult;
}

/** Phase 10B: owner-only read — legacy args used for shadow mismatch logging only. */
export function readOwnerOnlyDirectResultOverlayActive(
  display: NotificationOwnerDisplayState,
  selector: OwnerReadSelector,
  legacy?: LegacyDirectActiveCompare,
): boolean {
  const ownerActive = display.directResultOverlayActive;
  logOwnerPhase10BOwnerRead({
    selector,
    field: 'directResultOverlayActive',
    value: ownerActive,
  });
  if (legacy) {
    compareReadBool10B(
      selector,
      'directResultOverlayActive',
      ownerActive,
      legacy.state || legacy.ref,
    );
  }
  return ownerActive;
}

/** Phase 10B: owner-only read — legacy args used for shadow mismatch logging only. */
export function readOwnerOnlyQueueHead(
  ownerQueue: readonly QueuedOverlay[],
  selector: OwnerReadSelector,
  legacy?: LegacyQueueHeadCompare,
): QueuedOverlay | null {
  const ownerHead = ownerQueue[0] ?? null;
  if (!ownerHead && ownerQueue.length > 0) {
    traceQueueHeadNullReadSite({
      assignmentSite: 'readOwnerOnlyQueueHead',
      selector,
      ownerQueueLen: ownerQueue.length,
      ownerHeadPresent: false,
      ownerHeadRawKind: null,
      legacyHeadKind: legacy
        ? legacy.queue[0]?.kind ?? legacy.refQueue[0]?.kind ?? null
        : null,
      legacyQueueLen: legacy
        ? Math.max(legacy.queue.length, legacy.refQueue.length)
        : undefined,
    });
  }
  logOwnerPhase10BOwnerRead({
    selector,
    field: 'queueHead',
    kind: ownerHead?.kind ?? null,
    banId: ownerHead ? normalizeId(overlayBanId(ownerHead)) || null : null,
  });
  if (legacy) {
    const legacyHead = legacy.queue[0] ?? legacy.refQueue[0] ?? null;
    compareReadIds10B(
      selector,
      'queueHeadBanId',
      ownerHead ? normalizeId(overlayBanId(ownerHead)) || null : null,
      legacyHead ? normalizeId(overlayBanId(legacyHead)) || null : null,
    );
  }
  return ownerHead;
}

/** Phase 10B: owner-only read — legacy args used for shadow mismatch logging only. */
export function readOwnerOnlyQueueLen(
  ownerQueueLen: number,
  selector: OwnerReadSelector,
  legacyQueueLen?: number,
): number {
  logOwnerPhase10BOwnerRead({
    selector,
    field: 'queueLen',
    value: ownerQueueLen,
  });
  if (legacyQueueLen !== undefined) {
    compareReadNumber10B(selector, 'queueLen', ownerQueueLen, legacyQueueLen);
  }
  return ownerQueueLen;
}

/** Phase 10B: owner-only read — legacy args used for shadow mismatch logging only. */
export function readOwnerOnlyPendingLen(
  ownerPendingLen: number,
  selector: OwnerReadSelector,
  legacyPendingLen?: number,
): number {
  logOwnerPhase10BOwnerRead({
    selector,
    field: 'pendingLen',
    value: ownerPendingLen,
  });
  if (legacyPendingLen !== undefined) {
    compareReadNumber10B(
      selector,
      'pendingLen',
      ownerPendingLen,
      legacyPendingLen,
    );
  }
  return ownerPendingLen;
}

/** @deprecated Phase 10A — use readOwnerOnly* for render path. Kept for transitional tooling. */
export function readOwnerIncomingBan(
  display: NotificationOwnerDisplayState,
  legacyRef: BanInteraction | null,
  legacyState: BanInteraction | null,
  selector: OwnerReadSelector,
): BanInteraction | null {
  if (display.incomingBan?.id) {
    logOwnerPhase10AReadOwner({
      selector,
      field: 'incomingBan',
      banId: display.incomingBan.id,
    });
    compareReadIds10B(
      selector,
      'incomingBan',
      display.incomingBan.id,
      legacyState?.id ?? legacyRef?.id,
    );
    return display.incomingBan;
  }
  const fallback = legacyState ?? legacyRef ?? null;
  if (fallback?.id) {
    logOwnerPhase10AReadFallback({
      selector,
      field: 'incomingBan',
      reason: 'owner-display-incoming-empty',
      banId: fallback.id,
    });
  }
  return fallback;
}

/** @deprecated Phase 10A — use readOwnerOnly* for render path. */
export function readOwnerCheckBan(
  display: NotificationOwnerDisplayState,
  legacyRef: BanInteraction | null,
  legacyState: BanInteraction | null,
  selector: OwnerReadSelector,
): BanInteraction | null {
  if (display.checkBan?.id) {
    logOwnerPhase10AReadOwner({
      selector,
      field: 'checkBan',
      banId: display.checkBan.id,
    });
    compareReadIds10B(
      selector,
      'checkBan',
      display.checkBan.id,
      legacyState?.id ?? legacyRef?.id,
    );
    return display.checkBan;
  }
  const fallback = legacyState ?? legacyRef ?? null;
  if (fallback?.id) {
    logOwnerPhase10AReadFallback({
      selector,
      field: 'checkBan',
      reason: 'owner-display-check-empty',
      banId: fallback.id,
    });
  }
  return fallback;
}

/** @deprecated Phase 10A — use readOwnerOnly* for render path. */
export function readOwnerResult(
  display: NotificationOwnerDisplayState,
  legacyRef: BanResult | null,
  legacyState: BanResult | null,
  selector: OwnerReadSelector,
): BanResult | null {
  if (display.result?.id) {
    logOwnerPhase10AReadOwner({
      selector,
      field: 'result',
      banId: display.result.id,
    });
    compareReadIds10B(
      selector,
      'result',
      display.result.id,
      legacyState?.id ?? legacyRef?.id,
    );
    return display.result;
  }
  const fallback = legacyState ?? legacyRef ?? null;
  if (fallback?.id) {
    logOwnerPhase10AReadFallback({
      selector,
      field: 'result',
      reason: 'owner-display-result-empty',
      banId: fallback.id,
    });
  }
  return fallback;
}

/** @deprecated Phase 10A — use readOwnerOnly* for render path. */
export function readOwnerDirectResultOverlayActive(
  display: NotificationOwnerDisplayState,
  legacyRef: boolean,
  legacyState: boolean,
  selector: OwnerReadSelector,
): boolean {
  if (display.directResultOverlayActive) {
    logOwnerPhase10AReadOwner({
      selector,
      field: 'directResultOverlayActive',
      value: true,
    });
    compareReadBool10B(
      selector,
      'directResultOverlayActive',
      display.directResultOverlayActive,
      legacyState || legacyRef,
    );
    return display.directResultOverlayActive;
  }
  const fallback = legacyState || legacyRef;
  if (fallback) {
    logOwnerPhase10AReadFallback({
      selector,
      field: 'directResultOverlayActive',
      reason: 'owner-display-direct-inactive',
      value: fallback,
    });
  }
  return fallback;
}

/** @deprecated Phase 10A — use readOwnerOnly* for render path. */
export function readOwnerQueueHead(
  ownerQueue: readonly QueuedOverlay[],
  legacyQueue: readonly QueuedOverlay[],
  legacyRefQueue: readonly QueuedOverlay[],
  selector: OwnerReadSelector,
): QueuedOverlay | null {
  if (ownerQueue[0]) {
    logOwnerPhase10AReadOwner({
      selector,
      field: 'queueHead',
      kind: ownerQueue[0].kind,
      banId: normalizeId(overlayBanId(ownerQueue[0])) || null,
    });
    const legacyHead = legacyQueue[0] ?? legacyRefQueue[0] ?? null;
    compareReadIds10B(
      selector,
      'queueHeadBanId',
      normalizeId(overlayBanId(ownerQueue[0])) || null,
      legacyHead ? normalizeId(overlayBanId(legacyHead)) || null : null,
    );
    return ownerQueue[0];
  }
  const fallback = legacyQueue[0] ?? legacyRefQueue[0] ?? null;
  if (fallback) {
    logOwnerPhase10AReadFallback({
      selector,
      field: 'queueHead',
      reason: 'owner-queue-empty',
      kind: fallback.kind,
      banId: normalizeId(overlayBanId(fallback)) || null,
    });
  }
  return fallback;
}

/** @deprecated Phase 10A — use readOwnerOnly* for render path. */
export function readOwnerQueueLen(
  ownerQueueLen: number,
  legacyQueueLen: number,
  selector: OwnerReadSelector,
): number {
  if (ownerQueueLen > 0) {
    logOwnerPhase10AReadOwner({
      selector,
      field: 'queueLen',
      value: ownerQueueLen,
    });
    compareReadNumber10B(selector, 'queueLen', ownerQueueLen, legacyQueueLen);
    return ownerQueueLen;
  }
  if (legacyQueueLen > 0) {
    logOwnerPhase10AReadFallback({
      selector,
      field: 'queueLen',
      reason: 'owner-queue-len-zero',
      value: legacyQueueLen,
    });
  }
  return legacyQueueLen;
}

/** @deprecated Phase 10A — use readOwnerOnly* for render path. */
export function readOwnerPendingLen(
  ownerPendingLen: number,
  legacyPendingLen: number,
  selector: OwnerReadSelector,
): number {
  if (ownerPendingLen > 0) {
    logOwnerPhase10AReadOwner({
      selector,
      field: 'pendingLen',
      value: ownerPendingLen,
    });
    compareReadNumber10B(
      selector,
      'pendingLen',
      ownerPendingLen,
      legacyPendingLen,
    );
    return ownerPendingLen;
  }
  if (legacyPendingLen > 0) {
    logOwnerPhase10AReadFallback({
      selector,
      field: 'pendingLen',
      reason: 'owner-pending-len-zero',
      value: legacyPendingLen,
    });
  }
  return legacyPendingLen;
}

/** Explicit transitional fallback — log and surface mismatch when used. */
export function readOwnerResultWithLegacyFallback(
  display: NotificationOwnerDisplayState,
  legacy: LegacyResultCompare,
  selector: OwnerReadSelector,
  reason: string,
): BanResult | null {
  const ownerResult = readOwnerOnlyResult(display, selector, legacy);
  if (ownerResult?.id) return ownerResult;
  const fallback = legacy.state ?? legacy.ref ?? null;
  if (fallback?.id) {
    logOwnerPhase10BFallbackRemains({
      selector,
      field: 'result',
      reason,
      banId: fallback.id,
    });
    compareReadIds10B(selector, 'result', null, fallback.id);
  }
  return fallback;
}
