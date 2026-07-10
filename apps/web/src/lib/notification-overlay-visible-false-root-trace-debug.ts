'use client';

import { checkOverlayKey } from '@/lib/overlay-queue';
import { isClientDiagTraceEnvironment } from '@/lib/diag-trace-client';
import {
  readShellCheckActionMarkers,
  type ShellCheckActionMarkers,
} from '@/lib/shell-check-lifecycle-trace-debug';
import type { CheckOverlayParentReturnedBranch } from '@/lib/check-overlay-parent-return-branch-trace-debug';
import type { ShouldMountHostGuardSnapshot } from '@/lib/should-mount-notification-host-false-root-trace-debug';

export type NotificationOverlayVisibilityOperand = {
  name: string;
  value: string | boolean | number | null;
};

export type NotificationOverlayVisibilityEvaluation = {
  name: string;
  conditionResult: boolean;
};

export type NotificationOverlayVisibilitySnapshot = {
  reachedVisibilityGuards: string[];
  evaluatedVisibilityGuards: NotificationOverlayVisibilityEvaluation[];
  selectedVisibilityFalseGuard: string | null;
  visibilitySourceType: 'derived';
  guardSourceFunction: string;
  guardSourceLine: string;
  visibilityOperands: NotificationOverlayVisibilityOperand[];
  derivedResult: boolean;
};

export type NotificationOverlayVisibleFalseRootInput = {
  previousReturnedBranch: CheckOverlayParentReturnedBranch | null;
  currentReturnedBranch: CheckOverlayParentReturnedBranch;
  checkBanId: string | null;
  notificationOverlayVisible: boolean;
  visibilitySnapshot: NotificationOverlayVisibilitySnapshot;
  shouldMountGuardSnapshot: ShouldMountHostGuardSnapshot | null;
  shellKind: string | null;
  renderBranch: string | null;
  ownerDisplayKind: string | null;
  currentHeadKind: string | null;
  activeNotificationChain: boolean;
  visualQueueDimSessionLive: boolean;
  globalOverlayHostActive: boolean;
  overlayVisualShieldHostMounted: boolean;
  shouldMountNotificationOverlayHostFromGuards: boolean;
  overlayVisualShieldCardContentMounted: boolean;
  queueLen: number;
  ownerQueueLen: number;
};

export type NotificationOverlayVisibilityCollector = {
  markVisibilityGuardReached: (name: string) => void;
  markVisibilityGuardEvaluated: (name: string, conditionResult: boolean) => void;
  markVisibilityGuardSelected: (
    name: string,
    operands: NotificationOverlayVisibilityOperand[],
    sourceLine: string,
  ) => void;
  getSnapshot: (derivedResult: boolean) => NotificationOverlayVisibilitySnapshot;
};

const emittedKeys = new Set<string>();
let lastNotificationOverlayVisibilitySnapshot: NotificationOverlayVisibilitySnapshot | null =
  null;
let previousNotificationOverlayVisible: boolean | null = null;
let lastStagedNotificationOverlayVisible: boolean | null = null;
let lastVisibilitySnapshotTimestamp: number | null = null;

export type NotificationOverlayVisibilityBranchRootInput = {
  previousReturnedBranch: CheckOverlayParentReturnedBranch | null;
  checkBanId: string | null;
  notificationOverlayVisible: boolean;
  overlayVisualShieldCardContentMounted: boolean;
  shouldMountNotificationOverlayHostFromGuards: boolean;
  shellKind: string | null;
  renderBranch: string | null;
  ownerDisplayKind: string | null;
  currentHeadKind: string | null;
  activeNotificationChain: boolean;
  visualQueueDimSessionLive: boolean;
  globalOverlayHostActive: boolean;
  overlayVisualShieldHostMounted: boolean;
  queueLen: number;
  ownerQueueLen: number;
};

export function createNotificationOverlayVisibilityCollector(): NotificationOverlayVisibilityCollector {
  const reachedVisibilityGuards: string[] = [];
  const evaluatedVisibilityGuards: NotificationOverlayVisibilityEvaluation[] = [];
  let selectedVisibilityFalseGuard: string | null = null;
  let guardSourceLine = 'unknown';
  let visibilityOperands: NotificationOverlayVisibilityOperand[] = [];

  return {
    markVisibilityGuardReached(name: string) {
      reachedVisibilityGuards.push(name);
    },
    markVisibilityGuardEvaluated(name: string, conditionResult: boolean) {
      evaluatedVisibilityGuards.push({ name, conditionResult });
    },
    markVisibilityGuardSelected(
      name: string,
      operands: NotificationOverlayVisibilityOperand[],
      sourceLine: string,
    ) {
      selectedVisibilityFalseGuard = name;
      guardSourceLine = sourceLine;
      visibilityOperands = operands;
    },
    getSnapshot(derivedResult: boolean): NotificationOverlayVisibilitySnapshot {
      return {
        reachedVisibilityGuards: [...reachedVisibilityGuards],
        evaluatedVisibilityGuards: [...evaluatedVisibilityGuards],
        selectedVisibilityFalseGuard,
        visibilitySourceType: 'derived',
        guardSourceFunction: 'ProvidersBody:notificationOverlayVisible',
        guardSourceLine,
        visibilityOperands: [...visibilityOperands],
        derivedResult,
      };
    },
  };
}

export function stageNotificationOverlayVisibilitySnapshot(
  snapshot: NotificationOverlayVisibilitySnapshot,
): void {
  previousNotificationOverlayVisible = lastStagedNotificationOverlayVisible;
  lastStagedNotificationOverlayVisible = snapshot.derivedResult;
  lastNotificationOverlayVisibilitySnapshot = snapshot;
  lastVisibilitySnapshotTimestamp = performance.now();
}

export function readVisibilitySnapshotTimestamp(): number | null {
  return lastVisibilitySnapshotTimestamp;
}

export function readNotificationOverlayVisibilitySnapshot(): NotificationOverlayVisibilitySnapshot | null {
  return lastNotificationOverlayVisibilitySnapshot;
}

export function readPreviousNotificationOverlayVisible(): boolean | null {
  return previousNotificationOverlayVisible;
}

function hasExpectedExitMarkersFalse(markers: ShellCheckActionMarkers): boolean {
  return (
    !markers.userPressedCheckYes &&
    !markers.userPressedCheckNo &&
    !markers.submitCheckAnswerStarted &&
    !markers.checkDismissStarted &&
    !markers.checkConsumed &&
    !markers.resultArrivedAfterCheck
  );
}

function resolveFalseOperands(operands: NotificationOverlayVisibilityOperand[]): {
  firstFalseOperand: string | null;
  allFalseOperands: string[];
} {
  const allFalseOperands = operands
    .filter((operand) => {
      if (typeof operand.value === 'boolean') return operand.value === false;
      if (operand.value === null) return true;
      if (typeof operand.value === 'number') return operand.value === 0;
      if (typeof operand.value === 'string') return operand.value.length === 0;
      return false;
    })
    .map((operand) => operand.name);
  return {
    firstFalseOperand: allFalseOperands[0] ?? null,
    allFalseOperands,
  };
}

export function maybeEmitNotificationOverlayVisibleFalseRootTrace(
  _input: NotificationOverlayVisibleFalseRootInput,
): void {
  // Disabled in favor of NOTIFICATION_OVERLAY_VISIBILITY_BRANCH_ROOT_TRACE.
}

function resolveRootCause(input: {
  hasVisibilitySnapshot: boolean;
  selectedVisibilityFalseGuard: string | null;
  snapshotMatchesCurrentRender: boolean;
  snapshotMatchesCurrentCheckOverlayKey: boolean;
}): string {
  if (
    input.hasVisibilitySnapshot &&
    input.selectedVisibilityFalseGuard &&
    input.snapshotMatchesCurrentRender &&
    input.snapshotMatchesCurrentCheckOverlayKey
  ) {
    return input.selectedVisibilityFalseGuard;
  }
  if (!input.hasVisibilitySnapshot) {
    return 'visibility-snapshot-missing';
  }
  if (
    !input.snapshotMatchesCurrentRender ||
    !input.snapshotMatchesCurrentCheckOverlayKey
  ) {
    return 'visibility-snapshot-stale-or-mismatched';
  }
  if (!input.selectedVisibilityFalseGuard) {
    return 'visibility-false-without-selected-guard';
  }
  return 'unknown';
}

function resolveEmitBlockerFromPreviousVersion(input: {
  hasVisibilitySnapshot: boolean;
  selectedVisibilityFalseGuard: string | null;
  snapshotMatchesCurrentRender: boolean;
  snapshotMatchesCurrentCheckOverlayKey: boolean;
}): string {
  if (!input.hasVisibilitySnapshot) {
    return 'visibility-snapshot-missing';
  }
  if (!input.selectedVisibilityFalseGuard) {
    return 'selected-guard-required-but-missing';
  }
  if (!input.snapshotMatchesCurrentRender) {
    return 'snapshot-render-mismatch';
  }
  if (!input.snapshotMatchesCurrentCheckOverlayKey) {
    return 'snapshot-key-mismatch';
  }
  return 'unknown';
}

export function maybeEmitNotificationOverlayVisibilityBranchRootTrace(
  input: NotificationOverlayVisibilityBranchRootInput,
): void {
  if (!isClientDiagTraceEnvironment()) return;
  if (input.notificationOverlayVisible !== false) return;
  if (input.previousReturnedBranch !== 'check-overlay') return;

  const markers = readShellCheckActionMarkers();
  if (!hasExpectedExitMarkersFalse(markers)) return;

  const checkBanId = input.checkBanId?.trim() || null;
  const checkOverlayKeyValue = checkBanId ? checkOverlayKey(checkBanId) : null;
  if (!checkOverlayKeyValue) return;
  if (emittedKeys.has(checkOverlayKeyValue)) return;

  emittedKeys.add(checkOverlayKeyValue);

  const visibilitySnapshot = readNotificationOverlayVisibilitySnapshot();
  const hasVisibilitySnapshot = visibilitySnapshot != null;
  const visibilitySnapshotTimestamp = readVisibilitySnapshotTimestamp();
  const snapshotAgeMs =
    visibilitySnapshotTimestamp == null
      ? null
      : performance.now() - visibilitySnapshotTimestamp;
  const snapshotMatchesCurrentRender =
    hasVisibilitySnapshot &&
    visibilitySnapshot.derivedResult === input.notificationOverlayVisible;
  const snapshotMatchesCurrentCheckOverlayKey =
    hasVisibilitySnapshot &&
    snapshotMatchesCurrentRender &&
    snapshotAgeMs != null &&
    snapshotAgeMs <= 100;

  const selectedVisibilityFalseGuard =
    visibilitySnapshot?.selectedVisibilityFalseGuard ?? null;
  const visibilityOperands = visibilitySnapshot?.visibilityOperands ?? [];
  const { firstFalseOperand, allFalseOperands } = resolveFalseOperands(visibilityOperands);

  const diagnosticContext = {
    hasVisibilitySnapshot,
    selectedVisibilityFalseGuard,
    snapshotMatchesCurrentRender,
    snapshotMatchesCurrentCheckOverlayKey,
  };

  console.error('NOTIFICATION_OVERLAY_VISIBILITY_BRANCH_ROOT_TRACE', {
    checkBanId,
    checkOverlayKey: checkOverlayKeyValue,
    previousReturnedBranch: input.previousReturnedBranch,
    currentReturnedBranch: 'visual-shield-blocked',
    reason: 'notificationOverlayVisible-false',
    notificationOverlayVisible: input.notificationOverlayVisible,
    overlayVisualShieldCardContentMounted: input.overlayVisualShieldCardContentMounted,
    shouldMountNotificationOverlayHostFromGuards:
      input.shouldMountNotificationOverlayHostFromGuards,
    shellKind: input.shellKind,
    renderBranch: input.renderBranch,
    ownerDisplayKind: input.ownerDisplayKind,
    currentHeadKind: input.currentHeadKind,
    activeNotificationChain: input.activeNotificationChain,
    visualQueueDimSessionLive: input.visualQueueDimSessionLive,
    globalOverlayHostActive: input.globalOverlayHostActive,
    overlayVisualShieldHostMounted: input.overlayVisualShieldHostMounted,
    queueLen: input.queueLen,
    ownerQueueLen: input.ownerQueueLen,
    hasVisibilitySnapshot,
    visibilitySnapshotTimestamp,
    selectedVisibilityFalseGuard,
    reachedVisibilityGuards: visibilitySnapshot?.reachedVisibilityGuards ?? null,
    evaluatedVisibilityGuards: visibilitySnapshot?.evaluatedVisibilityGuards ?? null,
    visibilityOperands,
    firstFalseOperand,
    allFalseOperands,
    previousNotificationOverlayVisible: readPreviousNotificationOverlayVisible(),
    snapshotMatchesCurrentRender,
    snapshotMatchesCurrentCheckOverlayKey,
    snapshotAgeMs,
    ROOT_CAUSE: resolveRootCause(diagnosticContext),
    EMIT_BLOCKER_FROM_PREVIOUS_VERSION:
      resolveEmitBlockerFromPreviousVersion(diagnosticContext),
  });
}
