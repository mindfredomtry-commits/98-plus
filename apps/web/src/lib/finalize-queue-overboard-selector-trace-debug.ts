'use client';

import { checkOverlayKey } from '@/lib/overlay-queue';
import { isClientDiagTraceEnvironment } from '@/lib/diag-trace-client';
import {
  readShellCheckActionMarkers,
  type ShellCheckActionMarkers,
} from '@/lib/shell-check-lifecycle-trace-debug';

// FINAL runtime probe before the minimal fix. Records the REAL operand values of
// the queueOverboard selector and the head identity comparison, at the moment
// the queueOverboard branch has decided to dismiss — while the LIVE queue head
// is still an unanswered check.
//
// The selector is:
//   isQueueOverboardResultDismiss =
//     outcome === 'overboard' &&
//     !closeBefore.directResultOverlay &&
//     !closeBefore.directResultOverlayActive
// It reads NO current-head kind/identity, and the branch calls
// dismissCurrentOverlay unconditionally (regardless of queueHeadIsClickedResult).
//
// Event/callback-path only (inside finalizeResultForGoToBans). NOT a render
// probe: no useMemo/JSX, no module writes during render, no stack, no snapshot,
// no queue dump. One console.error per current check-head key.

export type FinalizeQueueOverboardSelectorRootCause =
  | 'queue-overboard-selector-ignores-current-head-identity'
  | 'stale-finalize-target-after-head-advanced'
  | 'queue-head-not-result-but-dismiss-remains-unconditional'
  | 'result-finalize-ran-after-check-became-head'
  | 'unknown';

export type FinalizeQueueOverboardSelectorRemovalStrategy =
  | 'remove-overlays-for-result'
  | 'plain-remove-overlays-for-ban';

export type FinalizeQueueOverboardSelectorInput = {
  // Invocation
  diagnosticCaller: string | null;
  calledFrom: string;
  sourceFunction: string;
  sourceLine: string;
  invocationReason: string;
  // Selector
  outcome: string | null;
  directResultOverlay: boolean;
  directResultOverlayActive: boolean;
  isQueueOverboardResultDismiss: boolean;
  selectorOperands: Record<string, boolean>;
  firstDecisiveOperand: string;
  selectedFinalizeBranch: string;
  // Result identity
  requestedBanId: string | null;
  normalizedRequestedBanId: string | null;
  resolvedResultBanId: string | null;
  resolvedResultId: string | null;
  resolvedResultOverlayKey: string | null;
  outcomeSource: string | null;
  resultPayloadExists: boolean;
  // Current queue head
  currentQueueHeadKind: string | null;
  currentQueueHeadBanId: string | null;
  currentQueueHeadResultId: string | null;
  currentQueueHeadKey: string | null;
  queueLenBefore: number;
  // Identity comparison
  queueHeadIsClickedResult: boolean;
  resultBanIdMatchesCurrentHeadBanId: boolean;
  resultIdMatchesCurrentHeadResultId: boolean;
  actualHeadKind: string | null;
  currentHeadIdentityMatchesFinalizeTarget: boolean;
  // Queue transformation
  nextQueueWithoutCurrentLen: number;
  nextQueueWithoutCurrentHeadKind: string | null;
  nextQueueWithoutCurrentHeadBanId: string | null;
  removalStrategy: FinalizeQueueOverboardSelectorRemovalStrategy;
  // Current display/check state
  ownerDisplayKind: string | null;
  ownerDisplayBanId: string | null;
  ownerPrimaryCheckBanExists: boolean | null;
  checkOverlayMounted: boolean | null;
  activeNotificationChain: boolean;
  notificationChainTransitioning: boolean;
  chainAdvanceWaiting: boolean;
  // Static code facts (reflect the real code, not assumptions)
  missingGuardCurrentHeadKind: boolean;
  missingGuardCurrentHeadIdentity: boolean;
  dismissWillRunUnconditionally: boolean;
};

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

// Derived strictly from the observed operand/identity values (never invented),
// in the exact priority order specified for this investigation.
function resolveRootCause(
  input: FinalizeQueueOverboardSelectorInput,
): FinalizeQueueOverboardSelectorRootCause {
  if (
    input.isQueueOverboardResultDismiss &&
    input.actualHeadKind === 'check' &&
    !input.currentHeadIdentityMatchesFinalizeTarget
  ) {
    return 'queue-overboard-selector-ignores-current-head-identity';
  }
  if (!input.currentHeadIdentityMatchesFinalizeTarget) {
    return 'stale-finalize-target-after-head-advanced';
  }
  if (!input.queueHeadIsClickedResult && input.dismissWillRunUnconditionally) {
    return 'queue-head-not-result-but-dismiss-remains-unconditional';
  }
  if (
    input.currentHeadIdentityMatchesFinalizeTarget &&
    input.actualHeadKind === 'check'
  ) {
    return 'result-finalize-ran-after-check-became-head';
  }
  return 'unknown';
}

const emittedKeys = new Set<string>();

// The single one-shot console emit. MUST be called only from the non-render
// finalizeResultForGoToBans callback, inside the queueOverboard branch after
// nextQueueWithoutCurrent/queueHeadIsClickedResult are computed and before any
// live-queue mutation.
export function maybeEmitFinalizeQueueOverboardSelectorTrace(
  input: FinalizeQueueOverboardSelectorInput,
): void {
  if (!isClientDiagTraceEnvironment()) return;

  // Only the selected queueOverboard branch, and only when the LIVE head is a
  // check (not the clicked result).
  if (!input.isQueueOverboardResultDismiss) return;
  if (input.currentQueueHeadKind !== 'check') return;

  const checkBanId = input.currentQueueHeadBanId?.trim() || null;
  if (!checkBanId) return;
  const key = checkOverlayKey(checkBanId);

  // Only when the user did NOT exit the check (all exit markers false).
  const markers = readShellCheckActionMarkers();
  if (!hasExpectedExitMarkersFalse(markers)) return;

  if (emittedKeys.has(key)) return;
  emittedKeys.add(key);

  console.error('FINALIZE_QUEUE_OVERBOARD_SELECTOR_TRACE', {
    // Invocation
    diagnosticCaller: input.diagnosticCaller,
    calledFrom: input.calledFrom,
    sourceFunction: input.sourceFunction,
    sourceLine: input.sourceLine,
    invocationReason: input.invocationReason,
    // Selector
    outcome: input.outcome,
    directResultOverlay: input.directResultOverlay,
    directResultOverlayActive: input.directResultOverlayActive,
    isQueueOverboardResultDismiss: input.isQueueOverboardResultDismiss,
    selectorOperands: input.selectorOperands,
    firstDecisiveOperand: input.firstDecisiveOperand,
    selectedFinalizeBranch: input.selectedFinalizeBranch,
    // Result identity
    requestedBanId: input.requestedBanId,
    normalizedRequestedBanId: input.normalizedRequestedBanId,
    resolvedResultBanId: input.resolvedResultBanId,
    resolvedResultId: input.resolvedResultId,
    resolvedResultOverlayKey: input.resolvedResultOverlayKey,
    outcomeSource: input.outcomeSource,
    resultPayloadExists: input.resultPayloadExists,
    // Current queue head
    currentQueueHeadKind: input.currentQueueHeadKind,
    currentQueueHeadBanId: input.currentQueueHeadBanId,
    currentQueueHeadResultId: input.currentQueueHeadResultId,
    currentQueueHeadKey: input.currentQueueHeadKey,
    checkOverlayKey: key,
    queueLenBefore: input.queueLenBefore,
    // Identity comparison
    queueHeadIsClickedResult: input.queueHeadIsClickedResult,
    resultBanIdMatchesCurrentHeadBanId: input.resultBanIdMatchesCurrentHeadBanId,
    resultIdMatchesCurrentHeadResultId: input.resultIdMatchesCurrentHeadResultId,
    expectedHeadKind: 'result',
    actualHeadKind: input.actualHeadKind,
    currentHeadIdentityMatchesFinalizeTarget:
      input.currentHeadIdentityMatchesFinalizeTarget,
    // Queue transformation
    nextQueueWithoutCurrentLen: input.nextQueueWithoutCurrentLen,
    nextQueueWithoutCurrentHeadKind: input.nextQueueWithoutCurrentHeadKind,
    nextQueueWithoutCurrentHeadBanId: input.nextQueueWithoutCurrentHeadBanId,
    removalStrategy: input.removalStrategy,
    // Current display/check state
    ownerDisplayKind: input.ownerDisplayKind,
    ownerDisplayBanId: input.ownerDisplayBanId,
    ownerPrimaryCheckBanExists: input.ownerPrimaryCheckBanExists,
    checkOverlayMounted: input.checkOverlayMounted,
    activeNotificationChain: input.activeNotificationChain,
    notificationChainTransitioning: input.notificationChainTransitioning,
    chainAdvanceWaiting: input.chainAdvanceWaiting,
    // Expected exit markers (all false when this fires)
    userPressedCheckYes: markers.userPressedCheckYes,
    userPressedCheckNo: markers.userPressedCheckNo,
    submitCheckAnswerStarted: markers.submitCheckAnswerStarted,
    checkDismissStarted: markers.checkDismissStarted,
    checkConsumed: markers.checkConsumed,
    resultArrivedAfterCheck: markers.resultArrivedAfterCheck,
    // Static code facts
    MISSING_GUARD_CURRENT_HEAD_KIND: input.missingGuardCurrentHeadKind,
    MISSING_GUARD_CURRENT_HEAD_IDENTITY: input.missingGuardCurrentHeadIdentity,
    DISMISS_WILL_RUN_UNCONDITIONALLY: input.dismissWillRunUnconditionally,
    // Verdict
    ROOT_CAUSE: resolveRootCause(input),
  });
}
