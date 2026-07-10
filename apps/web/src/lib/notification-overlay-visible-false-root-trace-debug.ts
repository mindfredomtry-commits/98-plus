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
  input: NotificationOverlayVisibleFalseRootInput,
): void {
  if (!isClientDiagTraceEnvironment()) return;
  if (input.notificationOverlayVisible !== false) return;
  if (input.previousReturnedBranch !== 'check-overlay') return;

  const shouldMountSelectedFalseGuard =
    input.shouldMountGuardSnapshot?.selectedFalseGuard ?? null;
  const mountGuardMatches =
    shouldMountSelectedFalseGuard === 'notification-overlay-not-visible';
  const inVisualShieldBlocked = input.currentReturnedBranch === 'visual-shield-blocked';
  if (!mountGuardMatches && !inVisualShieldBlocked) return;

  const markers = readShellCheckActionMarkers();
  if (!hasExpectedExitMarkersFalse(markers)) return;

  const checkBanId = input.checkBanId?.trim() || null;
  const checkOverlayKeyValue = checkBanId ? checkOverlayKey(checkBanId) : null;
  if (!checkOverlayKeyValue) return;
  if (emittedKeys.has(checkOverlayKeyValue)) return;

  const visibilitySnapshot = input.visibilitySnapshot;
  if (!visibilitySnapshot.selectedVisibilityFalseGuard) return;

  emittedKeys.add(checkOverlayKeyValue);

  const { firstFalseOperand, allFalseOperands } = resolveFalseOperands(
    visibilitySnapshot.visibilityOperands,
  );
  const writerTimestamp = performance.now();

  console.error('NOTIFICATION_OVERLAY_VISIBLE_FALSE_ROOT_TRACE', {
    checkBanId,
    checkOverlayKey: checkOverlayKeyValue,
    notificationOverlayVisible: input.notificationOverlayVisible,
    previousNotificationOverlayVisible: readPreviousNotificationOverlayVisible(),
    visibilitySourceType: visibilitySnapshot.visibilitySourceType,
    selectedVisibilityFalseGuard: visibilitySnapshot.selectedVisibilityFalseGuard,
    reachedVisibilityGuards: visibilitySnapshot.reachedVisibilityGuards,
    evaluatedVisibilityGuards: visibilitySnapshot.evaluatedVisibilityGuards,
    lastWriterName: visibilitySnapshot.selectedVisibilityFalseGuard,
    lastWriterReason: visibilitySnapshot.selectedVisibilityFalseGuard,
    lastWriterSourceFile: 'Providers.tsx',
    lastWriterSourceFunction: visibilitySnapshot.guardSourceFunction,
    lastWriterSourceLine: visibilitySnapshot.guardSourceLine,
    previousWrittenValue: readPreviousNotificationOverlayVisible(),
    nextWrittenValue: false,
    writerTimestamp,
    visibilityOperands: visibilitySnapshot.visibilityOperands,
    firstFalseOperand,
    allFalseOperands,
    previousReturnedBranch: input.previousReturnedBranch,
    currentReturnedBranch: input.currentReturnedBranch,
    selectedFalseGuard: shouldMountSelectedFalseGuard,
    shellKind: input.shellKind,
    renderBranch: input.renderBranch,
    ownerDisplayKind: input.ownerDisplayKind,
    currentHeadKind: input.currentHeadKind,
    activeNotificationChain: input.activeNotificationChain,
    visualQueueDimSessionLive: input.visualQueueDimSessionLive,
    globalOverlayHostActive: input.globalOverlayHostActive,
    overlayVisualShieldHostMounted: input.overlayVisualShieldHostMounted,
    shouldMountNotificationOverlayHostFromGuards:
      input.shouldMountNotificationOverlayHostFromGuards,
    overlayVisualShieldCardContentMounted: input.overlayVisualShieldCardContentMounted,
    queueLen: input.queueLen,
    ownerQueueLen: input.ownerQueueLen,
    userPressedCheckYes: markers.userPressedCheckYes,
    userPressedCheckNo: markers.userPressedCheckNo,
    submitCheckAnswerStarted: markers.submitCheckAnswerStarted,
    checkDismissStarted: markers.checkDismissStarted,
    checkConsumed: markers.checkConsumed,
    resultArrivedAfterCheck: markers.resultArrivedAfterCheck,
    ROOT_CAUSE: visibilitySnapshot.selectedVisibilityFalseGuard,
  });
}
