import type { QueuedOverlay } from '@/lib/overlay-queue';
import { overlayQueueKey } from '@/lib/overlay-queue';
import { normalizeId } from '@/lib/normalize-json';
import type { NotificationOverlayOwnerState } from '@/lib/notification-overlay-owner';
import { heldUserCardBanId } from '@/lib/overlay-user-card-guard';
import type { HeldUserCardOverlay } from '@/lib/overlay-user-card-guard';
import { logPhase12ParityCheck } from '@/lib/notification-overlay-owner-phase12-parity-debug';
import { isPhase12DiagEnabled } from '@/lib/notification-overlay-owner-phase12-diag-gate';

export type Phase12ParityHoldsSnapshot = {
  userCardKind: string | null;
  userCardBanId: string | null;
  checkResultWaitBanId: string | null;
  atomicOverboardBanId: string | null;
  overboardInFlightBanId: string | null;
  overkillTerminalKeys: string;
  resultPriorityKeys: string;
  checkAnswerInFlightKeys: string;
};

export type Phase12ParityActiveSnapshot = {
  kind: string | null;
  banId: string | null;
};

export type Phase12ParitySideSnapshot = {
  queueLen: number;
  pendingLen: number;
  queueKeys: string;
  pendingKeys: string;
  display: Phase12ParityActiveSnapshot;
  holds: Phase12ParityHoldsSnapshot;
  directResultOverlay: boolean;
  directResultOverlayActive: boolean;
};

export type Phase12ParityCheckPayload = {
  t: number;
  source: string;
  operation: string;
  owner: {
    queueLen: number;
    pendingLen: number;
    display: Phase12ParityActiveSnapshot;
    holds: Phase12ParityHoldsSnapshot;
  };
  legacy: {
    queueLen: number;
    pendingLen: number;
    active: Phase12ParityActiveSnapshot;
    holds: Phase12ParityHoldsSnapshot;
  };
  mismatch: boolean;
  mismatchReason: string | null;
  mirrorLagFrames: number;
  fallbackUsed: boolean;
};

function setKeys(set: ReadonlySet<string>): string {
  return [...set].map((id) => normalizeId(id)).filter(Boolean).sort().join('|');
}

function buildOwnerHoldsSnapshot(
  holds: NotificationOverlayOwnerState['holds'],
): Phase12ParityHoldsSnapshot {
  const held = holds.userCard;
  return {
    userCardKind: held?.kind ?? null,
    userCardBanId: held ? heldUserCardBanId(held) : null,
    checkResultWaitBanId: holds.checkResultWait?.banId ?? null,
    atomicOverboardBanId: holds.atomicOverboardBanId,
    overboardInFlightBanId: holds.overboardInFlightBanId,
    overkillTerminalKeys: setKeys(holds.overkillTerminalBanIds),
    resultPriorityKeys: setKeys(holds.resultPriorityBanIds),
    checkAnswerInFlightKeys: setKeys(holds.checkAnswerInFlight),
  };
}

function resolveOwnerDisplayKind(
  owner: NotificationOverlayOwnerState,
): string | null {
  const display = owner.display;
  if (display.directResultOverlay || display.directResultOverlayActive) {
    return 'result';
  }
  if (display.result) return 'result';
  if (display.checkBan) return 'check';
  if (display.incomingBan) return 'incoming';
  return null;
}

function resolveOwnerDisplayBanId(
  owner: NotificationOverlayOwnerState,
): string | null {
  const display = owner.display;
  return (
    display.result?.id ??
    display.checkBan?.id ??
    display.incomingBan?.id ??
    null
  );
}

export function buildPhase12ParityOwnerSide(
  owner: NotificationOverlayOwnerState,
): Phase12ParitySideSnapshot {
  return {
    queueLen: owner.queue.length,
    pendingLen: owner.pending.length,
    queueKeys: owner.queue.map(overlayQueueKey).join('|'),
    pendingKeys: owner.pending.map(overlayQueueKey).join('|'),
    display: {
      kind: resolveOwnerDisplayKind(owner),
      banId: resolveOwnerDisplayBanId(owner),
    },
    holds: buildOwnerHoldsSnapshot(owner.holds),
    directResultOverlay: owner.display.directResultOverlay,
    directResultOverlayActive: owner.display.directResultOverlayActive,
  };
}

export type Phase12ParityLegacyInput = {
  queue: readonly QueuedOverlay[];
  pending: readonly QueuedOverlay[];
  activeKind: string | null;
  activeBanId: string | null;
  heldUserCard: HeldUserCardOverlay | null;
  checkResultWaitBanId: string | null;
  atomicOverboardBanId: string | null;
  overboardInFlightBanId: string | null;
  overkillTerminalBanIds: ReadonlySet<string>;
  resultPriorityBanIds: ReadonlySet<string>;
  checkAnswerInFlight: ReadonlySet<string>;
  directResultOverlay: boolean;
  directResultOverlayActive: boolean;
};

export function buildPhase12ParityLegacySide(
  legacy: Phase12ParityLegacyInput,
): Phase12ParitySideSnapshot {
  const held = legacy.heldUserCard;
  return {
    queueLen: legacy.queue.length,
    pendingLen: legacy.pending.length,
    queueKeys: legacy.queue.map(overlayQueueKey).join('|'),
    pendingKeys: legacy.pending.map(overlayQueueKey).join('|'),
    display: {
      kind: legacy.activeKind,
      banId: legacy.activeBanId,
    },
    holds: {
      userCardKind: held?.kind ?? null,
      userCardBanId: held ? heldUserCardBanId(held) : null,
      checkResultWaitBanId: legacy.checkResultWaitBanId,
      atomicOverboardBanId: legacy.atomicOverboardBanId,
      overboardInFlightBanId: legacy.overboardInFlightBanId,
      overkillTerminalKeys: setKeys(legacy.overkillTerminalBanIds),
      resultPriorityKeys: setKeys(legacy.resultPriorityBanIds),
      checkAnswerInFlightKeys: setKeys(legacy.checkAnswerInFlight),
    },
    directResultOverlay: legacy.directResultOverlay,
    directResultOverlayActive: legacy.directResultOverlayActive,
  };
}

function compareActiveSnapshot(
  label: string,
  owner: Phase12ParityActiveSnapshot,
  legacy: Phase12ParityActiveSnapshot,
  reasons: string[],
): void {
  if (owner.kind !== legacy.kind) {
    reasons.push(
      `${label}.kind owner=${owner.kind ?? 'null'} legacy=${legacy.kind ?? 'null'}`,
    );
  }
  if (normalizeId(owner.banId ?? '') !== normalizeId(legacy.banId ?? '')) {
    reasons.push(
      `${label}.banId owner=${owner.banId ?? 'null'} legacy=${legacy.banId ?? 'null'}`,
    );
  }
}

function compareHoldsSnapshot(
  owner: Phase12ParityHoldsSnapshot,
  legacy: Phase12ParityHoldsSnapshot,
  reasons: string[],
): void {
  if (owner.userCardKind !== legacy.userCardKind) {
    reasons.push(
      `holds.userCardKind owner=${owner.userCardKind ?? 'null'} legacy=${legacy.userCardKind ?? 'null'}`,
    );
  }
  if (
    normalizeId(owner.userCardBanId ?? '') !==
    normalizeId(legacy.userCardBanId ?? '')
  ) {
    reasons.push(
      `holds.userCardBanId owner=${owner.userCardBanId ?? 'null'} legacy=${legacy.userCardBanId ?? 'null'}`,
    );
  }
  if (
    normalizeId(owner.checkResultWaitBanId ?? '') !==
    normalizeId(legacy.checkResultWaitBanId ?? '')
  ) {
    reasons.push(
      `holds.checkResultWaitBanId owner=${owner.checkResultWaitBanId ?? 'null'} legacy=${legacy.checkResultWaitBanId ?? 'null'}`,
    );
  }
  if (
    normalizeId(owner.atomicOverboardBanId ?? '') !==
    normalizeId(legacy.atomicOverboardBanId ?? '')
  ) {
    reasons.push(
      `holds.atomicOverboardBanId owner=${owner.atomicOverboardBanId ?? 'null'} legacy=${legacy.atomicOverboardBanId ?? 'null'}`,
    );
  }
  if (
    normalizeId(owner.overboardInFlightBanId ?? '') !==
    normalizeId(legacy.overboardInFlightBanId ?? '')
  ) {
    reasons.push(
      `holds.overboardInFlightBanId owner=${owner.overboardInFlightBanId ?? 'null'} legacy=${legacy.overboardInFlightBanId ?? 'null'}`,
    );
  }
  if (owner.overkillTerminalKeys !== legacy.overkillTerminalKeys) {
    reasons.push('holds.overkillTerminalKeys differ');
  }
  if (owner.resultPriorityKeys !== legacy.resultPriorityKeys) {
    reasons.push('holds.resultPriorityKeys differ');
  }
  if (owner.checkAnswerInFlightKeys !== legacy.checkAnswerInFlightKeys) {
    reasons.push('holds.checkAnswerInFlightKeys differ');
  }
}

export function evaluatePhase12Parity(
  owner: NotificationOverlayOwnerState,
  legacyInput: Phase12ParityLegacyInput,
): Omit<Phase12ParityCheckPayload, 't' | 'source' | 'operation' | 'mirrorLagFrames' | 'fallbackUsed'> {
  const ownerSide = buildPhase12ParityOwnerSide(owner);
  const legacySide = buildPhase12ParityLegacySide(legacyInput);
  const reasons: string[] = [];

  if (ownerSide.queueLen !== legacySide.queueLen) {
    reasons.push(
      `queue.length owner=${ownerSide.queueLen} legacy=${legacySide.queueLen}`,
    );
  }
  if (ownerSide.pendingLen !== legacySide.pendingLen) {
    reasons.push(
      `pending.length owner=${ownerSide.pendingLen} legacy=${legacySide.pendingLen}`,
    );
  }
  if (ownerSide.queueKeys !== legacySide.queueKeys) {
    reasons.push('queue.keys differ');
  }
  if (ownerSide.pendingKeys !== legacySide.pendingKeys) {
    reasons.push('pending.keys differ');
  }
  compareActiveSnapshot('display', ownerSide.display, legacySide.display, reasons);
  compareHoldsSnapshot(ownerSide.holds, legacySide.holds, reasons);
  if (ownerSide.directResultOverlay !== legacySide.directResultOverlay) {
    reasons.push(
      `directResultOverlay owner=${ownerSide.directResultOverlay} legacy=${legacySide.directResultOverlay}`,
    );
  }
  if (
    ownerSide.directResultOverlayActive !== legacySide.directResultOverlayActive
  ) {
    reasons.push(
      `directResultOverlayActive owner=${ownerSide.directResultOverlayActive} legacy=${legacySide.directResultOverlayActive}`,
    );
  }

  return {
    owner: {
      queueLen: ownerSide.queueLen,
      pendingLen: ownerSide.pendingLen,
      display: ownerSide.display,
      holds: ownerSide.holds,
    },
    legacy: {
      queueLen: legacySide.queueLen,
      pendingLen: legacySide.pendingLen,
      active: legacySide.display,
      holds: legacySide.holds,
    },
    mismatch: reasons.length > 0,
    mismatchReason: reasons.length > 0 ? reasons.join('; ') : null,
  };
}

export function runPhase12ParityCheckWithMirrorLag(args: {
  source: string;
  operation: string;
  getOwner: () => NotificationOverlayOwnerState;
  getLegacyInput: () => Phase12ParityLegacyInput;
  fallbackUsed?: boolean;
}): void {
  if (typeof window === 'undefined') return;
  if (!isPhase12DiagEnabled()) return;

  const emit = (mirrorLagFrames: number) => {
    const evaluated = evaluatePhase12Parity(args.getOwner(), args.getLegacyInput());
    logPhase12ParityCheck({
      t: performance.now(),
      source: args.source,
      operation: args.operation,
      ...evaluated,
      mirrorLagFrames,
      fallbackUsed: args.fallbackUsed ?? false,
    });
    return evaluated.mismatch;
  };

  const stillMismatch = emit(0);
  if (!stillMismatch) return;

  requestAnimationFrame(() => {
    const lag1Mismatch = emit(1);
    if (!lag1Mismatch) return;
    requestAnimationFrame(() => {
      emit(2);
    });
  });
}
