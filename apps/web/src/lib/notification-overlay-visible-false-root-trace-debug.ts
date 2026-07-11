'use client';

import { checkOverlayKey } from '@/lib/overlay-queue';
import { isClientDiagTraceEnvironment } from '@/lib/diag-trace-client';
import {
  readShellCheckActionMarkers,
  type ShellCheckActionMarkers,
} from '@/lib/shell-check-lifecycle-trace-debug';
import type { CheckOverlayParentReturnedBranch } from '@/lib/check-overlay-parent-return-branch-trace-debug';

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

export type NotificationOverlayVisibleFinalGuardEmitContext = {
  checkBanId: string | null;
  shellKind: string | null;
  renderBranch: string | null;
  ownerDisplayKind: string | null;
  currentHeadKind: string | null;
  activeNotificationChain: boolean;
  notificationChainTransitioning: boolean;
  chainAdvanceWaiting: boolean;
  checkOverlayMounted: boolean;
  showCheckOverlayDirect: boolean;
  showDirectOverboardLayer: boolean;
  sendSuccessCardActive: boolean;
  replyParentActivePriorityActive: boolean;
  activeBanCardReady: boolean;
  notificationQueueShellKind: string | null;
  ownerPrimaryHeldUserCardExists: boolean;
  ownerPrimaryCheckBanForDisplayGuardsExists: boolean;
  hasRenderableCard: boolean | null;
  shouldHoldNotificationOverlayVisibleDuringQueueGap: boolean | null;
  previousQueueShellReturnedBranch: CheckOverlayParentReturnedBranch | null;
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

const finalGuardEmittedKeys = new Set<string>();
let lastNotificationOverlayVisibilitySnapshot: NotificationOverlayVisibilitySnapshot | null =
  null;
let previousNotificationOverlayVisible: boolean | null = null;
let lastStagedNotificationOverlayVisible: boolean | null = null;
let lastVisibilitySnapshotTimestamp: number | null = null;

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

function isCheckContextActive(
  input: NotificationOverlayVisibleFinalGuardEmitContext,
): boolean {
  const checkOverlayKeyValue = input.checkBanId
    ? checkOverlayKey(input.checkBanId)
    : null;
  return (
    input.shellKind === 'check' ||
    input.ownerDisplayKind === 'check' ||
    input.currentHeadKind === 'check' ||
    checkOverlayKeyValue != null ||
    input.previousQueueShellReturnedBranch === 'check-overlay'
  );
}

export function maybeEmitNotificationOverlayVisibleFinalGuardTrace(
  collector: NotificationOverlayVisibilityCollector,
  input: NotificationOverlayVisibleFinalGuardEmitContext,
): void {
  if (!isClientDiagTraceEnvironment()) return;

  const snapshot = collector.getSnapshot(false);
  if (!snapshot.selectedVisibilityFalseGuard) return;
  if (!isCheckContextActive(input)) return;

  const markers = readShellCheckActionMarkers();
  if (!hasExpectedExitMarkersFalse(markers)) return;

  const checkBanId = input.checkBanId?.trim() || null;
  const checkOverlayKeyValue = checkBanId ? checkOverlayKey(checkBanId) : null;
  if (!checkOverlayKeyValue) return;
  if (finalGuardEmittedKeys.has(checkOverlayKeyValue)) return;

  finalGuardEmittedKeys.add(checkOverlayKeyValue);

  const { firstFalseOperand, allFalseOperands } = resolveFalseOperands(
    snapshot.visibilityOperands,
  );

  console.error('NOTIFICATION_OVERLAY_VISIBLE_FINAL_GUARD_TRACE', {
    checkBanId,
    checkOverlayKey: checkOverlayKeyValue,
    ROOT_CAUSE: snapshot.selectedVisibilityFalseGuard,
    selectedVisibilityFalseGuard: snapshot.selectedVisibilityFalseGuard,
    selectedGuardSourceLine: snapshot.guardSourceLine,
    selectedGuardOperands: snapshot.visibilityOperands,
    firstFalseOperand,
    allFalseOperands,
    reachedVisibilityGuards: snapshot.reachedVisibilityGuards,
    evaluatedVisibilityGuards: snapshot.evaluatedVisibilityGuards,
    notificationOverlayVisibleResult: false,
    shellKind: input.shellKind,
    renderBranch: input.renderBranch,
    ownerDisplayKind: input.ownerDisplayKind,
    currentHeadKind: input.currentHeadKind,
    activeNotificationChain: input.activeNotificationChain,
    notificationChainTransitioning: input.notificationChainTransitioning,
    chainAdvanceWaiting: input.chainAdvanceWaiting,
    checkOverlayMounted: input.checkOverlayMounted,
    showCheckOverlayDirect: input.showCheckOverlayDirect,
    showDirectOverboardLayer: input.showDirectOverboardLayer,
    sendSuccessCardActive: input.sendSuccessCardActive,
    replyParentActivePriorityActive: input.replyParentActivePriorityActive,
    activeBanCardReady: input.activeBanCardReady,
    notificationQueueShellKind: input.notificationQueueShellKind,
    ownerPrimaryHeldUserCardExists: input.ownerPrimaryHeldUserCardExists,
    ownerPrimaryCheckBanForDisplayGuardsExists:
      input.ownerPrimaryCheckBanForDisplayGuardsExists,
    hasRenderableCard: input.hasRenderableCard,
    shouldHoldNotificationOverlayVisibleDuringQueueGap:
      input.shouldHoldNotificationOverlayVisibleDuringQueueGap,
    userPressedCheckYes: markers.userPressedCheckYes,
    userPressedCheckNo: markers.userPressedCheckNo,
    submitCheckAnswerStarted: markers.submitCheckAnswerStarted,
    checkDismissStarted: markers.checkDismissStarted,
    checkConsumed: markers.checkConsumed,
    resultArrivedAfterCheck: markers.resultArrivedAfterCheck,
  });
}

export function maybeEmitNotificationOverlayVisibilityBranchRootTrace(
  _input: unknown,
): void {
  // Disabled in favor of NOTIFICATION_OVERLAY_VISIBLE_FINAL_GUARD_TRACE.
}
