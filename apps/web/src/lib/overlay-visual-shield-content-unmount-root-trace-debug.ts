'use client';

import { checkOverlayKey } from '@/lib/overlay-queue';
import { diagTraceNow, isClientDiagTraceEnvironment } from '@/lib/diag-trace-client';
import { readShellCheckActionMarkers } from '@/lib/shell-check-lifecycle-trace-debug';
import { readCheckOverlayParentReturnedBranch } from '@/lib/check-overlay-parent-return-branch-trace-debug';

export type OverlayVisualShieldContentValueSourceType =
  | 'state-write'
  | 'ref-write'
  | 'derived-value'
  | 'mount-state'
  | 'host-state'
  | 'session-state'
  | 'unknown';

export type OverlayVisualShieldContentUnmountRootCause =
  | 'visual-shield-host-unmounted'
  | 'visual-shield-session-closed'
  | 'visual-dim-session-released'
  | 'card-content-mount-flag-cleared'
  | 'parent-remounted'
  | 'overlay-host-stopped-emitting'
  | 'queue-cleared'
  | 'active-chain-cleared'
  | 'explicit-dismiss'
  | 'derived-input-changed'
  | 'unknown';

export type OverlayVisualShieldContentTransitionSnapshot = {
  shellKind: string | null;
  renderBranch: string | null;
  returnedBranch: string | null;
  notificationOverlayVisible: boolean;
  activeNotificationChain: boolean;
  visualQueueDimSessionLive: boolean;
  globalOverlayHostActive: boolean;
  overlaySessionOpen: boolean;
  cardContentMounted: boolean;
  hostMounted: boolean;
  queueLen: number;
  ownerQueueLen: number;
  checkBanId: string | null;
  shouldMountNotificationOverlayHostFromGuards: boolean;
  showDirectOverboardLayer: boolean;
  parentMountId: string;
  composeBlocksNotificationHost: boolean;
};

export type OverlayVisualShieldContentUnmountRootInput = {
  source: string;
  reason: string;
  calledFrom: string;
  nextCardContentMounted: boolean;
  snapshotAfter: OverlayVisualShieldContentTransitionSnapshot;
  derivation: {
    valueSourceType: OverlayVisualShieldContentValueSourceType;
    exactWriterOrDerivation: string;
    exactSourceFile: string;
    exactSourceFunction: string;
    exactSourceLine: string;
    operands: {
      shouldMountNotificationOverlayHostFromGuards: boolean;
      showDirectOverboardLayer: boolean;
    };
  };
};

const emittedKeys = new Set<string>();
let previousSnapshot: OverlayVisualShieldContentTransitionSnapshot | null = null;
let previousOperands: OverlayVisualShieldContentUnmountRootInput['derivation']['operands'] | null =
  null;

function hasExpectedExitMarkersFalse(): boolean {
  const markers = readShellCheckActionMarkers();
  return (
    !markers.userPressedCheckYes &&
    !markers.userPressedCheckNo &&
    !markers.submitCheckAnswerStarted &&
    !markers.checkDismissStarted &&
    !markers.checkConsumed &&
    !markers.resultArrivedAfterCheck
  );
}

function checkWasActiveBefore(snapshot: OverlayVisualShieldContentTransitionSnapshot): boolean {
  const returnedBranch = readCheckOverlayParentReturnedBranch('queue-shell');
  return (
    snapshot.shellKind === 'check' ||
    snapshot.renderBranch === 'shell-check' ||
    returnedBranch === 'check-overlay' ||
    snapshot.returnedBranch === 'check-overlay'
  );
}

function resolveFirstChangedOperand(
  before: OverlayVisualShieldContentUnmountRootInput['derivation']['operands'],
  after: OverlayVisualShieldContentUnmountRootInput['derivation']['operands'],
): string | null {
  if (
    before.shouldMountNotificationOverlayHostFromGuards !==
    after.shouldMountNotificationOverlayHostFromGuards
  ) {
    return 'shouldMountNotificationOverlayHostFromGuards';
  }
  if (before.showDirectOverboardLayer !== after.showDirectOverboardLayer) {
    return 'showDirectOverboardLayer';
  }
  return null;
}

function buildCausalFlags(input: {
  before: OverlayVisualShieldContentTransitionSnapshot;
  after: OverlayVisualShieldContentTransitionSnapshot;
  firstChangedOperand: string | null;
}): {
  hostUnmounted: boolean;
  overlaySessionClosed: boolean;
  visualDimSessionReleased: boolean;
  cardContentMountFlagCleared: boolean;
  parentRemounted: boolean;
  overlayHostStoppedEmitting: boolean;
  resultBranchWon: boolean;
  explicitDismiss: boolean;
  queueCleared: boolean;
  activeChainCleared: boolean;
} {
  const markers = readShellCheckActionMarkers();
  return {
    hostUnmounted: input.before.hostMounted && !input.after.hostMounted,
    overlaySessionClosed:
      input.before.overlaySessionOpen && !input.after.overlaySessionOpen,
    visualDimSessionReleased:
      input.before.visualQueueDimSessionLive &&
      !input.after.visualQueueDimSessionLive,
    cardContentMountFlagCleared:
      input.before.shouldMountNotificationOverlayHostFromGuards &&
      !input.after.shouldMountNotificationOverlayHostFromGuards,
    parentRemounted: input.before.parentMountId !== input.after.parentMountId,
    overlayHostStoppedEmitting:
      input.before.globalOverlayHostActive &&
      !input.after.globalOverlayHostActive,
    resultBranchWon:
      input.after.shellKind === 'result' ||
      input.after.returnedBranch === 'result-overlay',
    explicitDismiss:
      markers.userPressedCheckYes ||
      markers.userPressedCheckNo ||
      markers.submitCheckAnswerStarted ||
      markers.checkDismissStarted ||
      markers.checkConsumed ||
      markers.resultArrivedAfterCheck,
    queueCleared:
      input.before.ownerQueueLen > 0 && input.after.ownerQueueLen === 0,
    activeChainCleared:
      input.before.activeNotificationChain &&
      !input.after.activeNotificationChain,
  };
}

function resolveRootCause(input: {
  flags: ReturnType<typeof buildCausalFlags>;
  firstChangedOperand: string | null;
}): OverlayVisualShieldContentUnmountRootCause {
  if (input.flags.overlayHostStoppedEmitting) {
    return 'overlay-host-stopped-emitting';
  }
  if (input.flags.overlaySessionClosed) {
    return 'visual-shield-session-closed';
  }
  if (input.flags.visualDimSessionReleased) {
    return 'visual-dim-session-released';
  }
  if (input.flags.cardContentMountFlagCleared) {
    return 'card-content-mount-flag-cleared';
  }
  if (input.flags.hostUnmounted) {
    return 'visual-shield-host-unmounted';
  }
  if (input.flags.queueCleared) {
    return 'queue-cleared';
  }
  if (input.flags.activeChainCleared) {
    return 'active-chain-cleared';
  }
  if (input.flags.parentRemounted) {
    return 'parent-remounted';
  }
  if (input.flags.explicitDismiss) {
    return 'explicit-dismiss';
  }
  if (input.firstChangedOperand) {
    return 'derived-input-changed';
  }
  return 'unknown';
}

export function observeOverlayVisualShieldContentUnmountRoot(
  input: OverlayVisualShieldContentUnmountRootInput,
): void {
  const before = previousSnapshot;
  const beforeOperands = previousOperands;
  previousSnapshot = input.snapshotAfter;
  previousOperands = input.derivation.operands;

  if (!isClientDiagTraceEnvironment()) return;
  if (!before) return;

  const previousValue = before.cardContentMounted;
  const nextValue = input.nextCardContentMounted;
  if (!(previousValue === true && nextValue === false)) return;
  if (!checkWasActiveBefore(before)) return;
  if (!hasExpectedExitMarkersFalse()) return;

  const checkBanId = before.checkBanId?.trim() || input.snapshotAfter.checkBanId?.trim() || null;
  const overlayKey = checkBanId ? checkOverlayKey(checkBanId) : null;
  if (!overlayKey) return;
  if (emittedKeys.has(overlayKey)) return;
  emittedKeys.add(overlayKey);

  const firstChangedOperand =
    beforeOperands != null
      ? resolveFirstChangedOperand(beforeOperands, input.derivation.operands)
      : null;
  const flags = buildCausalFlags({
    before,
    after: input.snapshotAfter,
    firstChangedOperand,
  });

  console.error('OVERLAY_VISUAL_SHIELD_CONTENT_UNMOUNT_ROOT_TRACE', {
    timestamp: diagTraceNow(),
    checkBanId,
    checkOverlayKey: overlayKey,
    previousValue,
    nextValue,
    source: input.source,
    reason: input.reason,
    calledFrom: input.calledFrom,
    valueSourceType: input.derivation.valueSourceType,
    exactWriterOrDerivation: input.derivation.exactWriterOrDerivation,
    exactSourceFile: input.derivation.exactSourceFile,
    exactSourceFunction: input.derivation.exactSourceFunction,
    exactSourceLine: input.derivation.exactSourceLine,
    firstChangedOperand,
    changedOperands:
      beforeOperands == null
        ? null
        : {
            shouldMountNotificationOverlayHostFromGuards: {
              before: beforeOperands.shouldMountNotificationOverlayHostFromGuards,
              after: input.derivation.operands.shouldMountNotificationOverlayHostFromGuards,
            },
            showDirectOverboardLayer: {
              before: beforeOperands.showDirectOverboardLayer,
              after: input.derivation.operands.showDirectOverboardLayer,
            },
          },
    previousShellKind: before.shellKind,
    previousRenderBranch: before.renderBranch,
    previousReturnedBranch: before.returnedBranch,
    previousNotificationOverlayVisible: before.notificationOverlayVisible,
    previousActiveNotificationChain: before.activeNotificationChain,
    previousVisualQueueDimSessionLive: before.visualQueueDimSessionLive,
    previousGlobalOverlayHostActive: before.globalOverlayHostActive,
    previousOverlaySessionOpen: before.overlaySessionOpen,
    previousCardContentMounted: before.cardContentMounted,
    previousHostMounted: before.hostMounted,
    previousQueueLen: before.queueLen,
    previousOwnerQueueLen: before.ownerQueueLen,
    nextShellKind: input.snapshotAfter.shellKind,
    nextRenderBranch: input.snapshotAfter.renderBranch,
    nextReturnedBranch: input.snapshotAfter.returnedBranch,
    nextNotificationOverlayVisible: input.snapshotAfter.notificationOverlayVisible,
    nextActiveNotificationChain: input.snapshotAfter.activeNotificationChain,
    nextVisualQueueDimSessionLive: input.snapshotAfter.visualQueueDimSessionLive,
    nextGlobalOverlayHostActive: input.snapshotAfter.globalOverlayHostActive,
    nextOverlaySessionOpen: input.snapshotAfter.overlaySessionOpen,
    nextCardContentMounted: input.snapshotAfter.cardContentMounted,
    nextHostMounted: input.snapshotAfter.hostMounted,
    nextQueueLen: input.snapshotAfter.queueLen,
    nextOwnerQueueLen: input.snapshotAfter.ownerQueueLen,
    hostUnmounted: flags.hostUnmounted,
    overlaySessionClosed: flags.overlaySessionClosed,
    visualDimSessionReleased: flags.visualDimSessionReleased,
    cardContentMountFlagCleared: flags.cardContentMountFlagCleared,
    parentRemounted: flags.parentRemounted,
    overlayHostStoppedEmitting: flags.overlayHostStoppedEmitting,
    resultBranchWon: flags.resultBranchWon,
    explicitDismiss: flags.explicitDismiss,
    queueCleared: flags.queueCleared,
    activeChainCleared: flags.activeChainCleared,
    ROOT_CAUSE: resolveRootCause({ flags, firstChangedOperand }),
  });
}
