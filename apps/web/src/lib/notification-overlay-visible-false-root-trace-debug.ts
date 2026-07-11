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

let lastNotificationOverlayVisibilitySnapshot: NotificationOverlayVisibilitySnapshot | null =
  null;
let previousNotificationOverlayVisible: boolean | null = null;
let lastStagedNotificationOverlayVisible: boolean | null = null;
let lastVisibilitySnapshotTimestamp: number | null = null;

// Silent, gate-free record of the last actual `return false` inside
// notificationOverlayVisible. This is diagnostics-only module-level state; it is
// NOT gated, deduped, or tied to any check context. The single console emit lives
// later, in the proven visual-shield-blocked branch.
export type NotificationOverlayVisibilityFalseDecision = {
  selectedVisibilityFalseGuard: string | null;
  selectedGuardOperands: NotificationOverlayVisibilityOperand[];
  firstFalseOperand: string | null;
  allFalseOperands: string[];
  reachedVisibilityGuards: string[];
  evaluatedVisibilityGuards: NotificationOverlayVisibilityEvaluation[];
  timestamp: number;
  renderToken: number;
  checkBanId: string | null;
  checkOverlayKey: string | null;
  shellKind: string | null;
  ownerDisplayKind: string | null;
  currentHeadKind: string | null;
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
};

let lastNotificationOverlayVisibilityFalseDecision: NotificationOverlayVisibilityFalseDecision | null =
  null;
let notificationOverlayVisibilityFalseDecisionSequence = 0;
const selectedFalseGuardEmittedKeys = new Set<string>();

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

// Silent capture: record the last actual `return false` decision.
// NO gates: no active-check check, no previousReturnedBranch check, no
// checkOverlayKey requirement, no dedup, no console, no useEffect, and no
// mutation of any application state/refs. Diagnostics-only.
export function captureNotificationOverlayVisibilityFalseDecision(
  collector: NotificationOverlayVisibilityCollector,
  input: NotificationOverlayVisibleFinalGuardEmitContext,
): void {
  const snapshot = collector.getSnapshot(false);
  const { firstFalseOperand, allFalseOperands } = resolveFalseOperands(
    snapshot.visibilityOperands,
  );
  const checkBanId = input.checkBanId?.trim() || null;
  const checkOverlayKeyValue = checkBanId ? checkOverlayKey(checkBanId) : null;
  notificationOverlayVisibilityFalseDecisionSequence += 1;
  lastNotificationOverlayVisibilityFalseDecision = {
    selectedVisibilityFalseGuard: snapshot.selectedVisibilityFalseGuard,
    selectedGuardOperands: snapshot.visibilityOperands,
    firstFalseOperand,
    allFalseOperands,
    reachedVisibilityGuards: snapshot.reachedVisibilityGuards,
    evaluatedVisibilityGuards: snapshot.evaluatedVisibilityGuards,
    timestamp: performance.now(),
    renderToken: notificationOverlayVisibilityFalseDecisionSequence,
    checkBanId,
    checkOverlayKey: checkOverlayKeyValue,
    shellKind: input.shellKind,
    ownerDisplayKind: input.ownerDisplayKind,
    currentHeadKind: input.currentHeadKind,
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
  };
}

export function readNotificationOverlayVisibilityFalseDecision(): NotificationOverlayVisibilityFalseDecision | null {
  return lastNotificationOverlayVisibilityFalseDecision;
}

export type NotificationOverlayVisibleSelectedFalseGuardEmitContext = {
  checkBanId: string | null;
  notificationOverlayVisible: boolean;
  overlayVisualShieldCardContentMounted: boolean;
  previousReturnedBranch: CheckOverlayParentReturnedBranch | null;
  shellKind: string | null;
  renderBranch: string | null;
  ownerDisplayKind: string | null;
  currentHeadKind: string | null;
};

// The single console emit. It lives in the already-proven visual-shield-blocked
// branch, not inside useMemo. Minimal gates only; it does NOT require the silent
// capture to exist, nor its key to match. If the capture is missing, the log is
// still emitted with ROOT_CAUSE 'false-return-capture-missing'.
export function maybeEmitNotificationOverlayVisibleSelectedFalseGuardTrace(
  input: NotificationOverlayVisibleSelectedFalseGuardEmitContext,
): void {
  if (!isClientDiagTraceEnvironment()) return;
  if (input.notificationOverlayVisible !== false) return;
  if (input.previousReturnedBranch !== 'check-overlay') return;

  const markers = readShellCheckActionMarkers();
  if (!hasExpectedExitMarkersFalse(markers)) return;

  const checkBanId = input.checkBanId?.trim() || null;
  const checkOverlayKeyValue = checkBanId ? checkOverlayKey(checkBanId) : null;
  if (!checkOverlayKeyValue) return;
  if (selectedFalseGuardEmittedKeys.has(checkOverlayKeyValue)) return;

  selectedFalseGuardEmittedKeys.add(checkOverlayKeyValue);

  const decision = lastNotificationOverlayVisibilityFalseDecision;
  const hasFalseReturnCapture = decision != null;
  const currentRenderToken = notificationOverlayVisibilityFalseDecisionSequence;
  const captureAgeMs = decision ? performance.now() - decision.timestamp : null;
  const captureKeyMatchesCurrent = decision
    ? decision.checkOverlayKey === checkOverlayKeyValue
    : false;

  const rootCause = hasFalseReturnCapture
    ? decision!.selectedVisibilityFalseGuard
    : 'false-return-capture-missing';

  console.error('NOTIFICATION_OVERLAY_VISIBLE_SELECTED_FALSE_GUARD_TRACE', {
    checkBanId,
    checkOverlayKey: checkOverlayKeyValue,
    previousReturnedBranch: input.previousReturnedBranch,
    currentReturnedBranch: 'visual-shield-blocked',
    notificationOverlayVisible: input.notificationOverlayVisible,
    overlayVisualShieldCardContentMounted:
      input.overlayVisualShieldCardContentMounted,

    hasFalseReturnCapture,
    captureAgeMs,
    captureRenderToken: decision?.renderToken ?? null,
    currentRenderToken,
    captureCheckOverlayKey: decision?.checkOverlayKey ?? null,
    captureCheckBanId: decision?.checkBanId ?? null,
    captureKeyMatchesCurrent,

    selectedVisibilityFalseGuard: decision?.selectedVisibilityFalseGuard ?? null,
    selectedGuardOperands: decision?.selectedGuardOperands ?? null,
    firstFalseOperand: decision?.firstFalseOperand ?? null,
    allFalseOperands: decision?.allFalseOperands ?? null,
    reachedVisibilityGuards: decision?.reachedVisibilityGuards ?? null,
    evaluatedVisibilityGuards: decision?.evaluatedVisibilityGuards ?? null,

    shellKind: input.shellKind,
    renderBranch: input.renderBranch,
    ownerDisplayKind: input.ownerDisplayKind,
    currentHeadKind: input.currentHeadKind,

    ROOT_CAUSE: rootCause,
    PREVIOUS_FINAL_GUARD_TRACE_MISSED_REASON:
      'emit-inside-useMemo-check-context-gate-failed',
  });
}

export function maybeEmitNotificationOverlayVisibleFinalGuardTrace(
  _collector: NotificationOverlayVisibilityCollector,
  _input: NotificationOverlayVisibleFinalGuardEmitContext,
): void {
  // Console emit disabled. Replaced by the silent capture
  // (captureNotificationOverlayVisibilityFalseDecision) inside useMemo and the
  // single NOTIFICATION_OVERLAY_VISIBLE_SELECTED_FALSE_GUARD_TRACE emit that fires
  // later in the proven visual-shield-blocked branch.
}

export function maybeEmitNotificationOverlayVisibilityBranchRootTrace(
  _input: unknown,
): void {
  // Console emit disabled (NOTIFICATION_OVERLAY_VISIBILITY_BRANCH_ROOT_TRACE).
}
