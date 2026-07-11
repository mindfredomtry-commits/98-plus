'use client';

import { checkOverlayKey } from '@/lib/overlay-queue';
import { isClientDiagTraceEnvironment } from '@/lib/diag-trace-client';
import {
  readShellCheckActionMarkers,
  type ShellCheckActionMarkers,
} from '@/lib/shell-check-lifecycle-trace-debug';

// WHO/WHY called dismissCurrentOverlay() at the exact moment a check overlay is
// consumed without the user having performed an expected exit. This is the
// caller-identity probe, emitted from the event/callback path (inside
// dismissCurrentOverlay, right before the first ownerShadowDispatch mutation).
// It is NOT a render-phase probe: no module writes happen during render, no
// useMemo/JSX involvement, no stack, no snapshot, no queue dump.

// Derived ONLY from a real diagnosticCaller token that exists at a call site.
export type CheckDismissUnexpectedCallerRootCause =
  | 'submit-check-answer'
  | 'explicit-user-dismiss'
  | 'go-to-bans'
  | 'chain-advance'
  | 'transition-completion'
  | 'queue-sync'
  | 'clear-check-overlay'
  | 'auto-close'
  | 'effect-cleanup'
  | 'fallback-recovery'
  | 'stale-callback'
  | 'unknown';

export type CheckDismissCallerCategory =
  | 'user action'
  | 'submit answer'
  | 'result handoff'
  | 'chain advance'
  | 'queue sync'
  | 'timeout'
  | 'effect'
  | 'GO TO BANS'
  | 'clear overlay'
  | 'fallback/error recovery'
  | 'other';

type CallerMeta = {
  callerCategory: CheckDismissCallerCategory;
  rootCause: CheckDismissUnexpectedCallerRootCause;
};

// Maps the explicit per-call-site diagnosticCaller token to its category and
// root-cause candidate. Every key here corresponds to a REAL call site of
// dismissCurrentOverlay; unknown tokens fall through to `other` / `unknown`.
const CALLER_META: Record<string, CallerMeta> = {
  submitCheckAnswer: {
    callerCategory: 'submit answer',
    rootCause: 'submit-check-answer',
  },
  clearCheckOverlay: {
    callerCategory: 'clear overlay',
    rootCause: 'clear-check-overlay',
  },
  dismissIncoming: {
    callerCategory: 'user action',
    rootCause: 'explicit-user-dismiss',
  },
  dismissBanResult: {
    callerCategory: 'result handoff',
    rootCause: 'unknown',
  },
  replyCompletedRoute: {
    callerCategory: 'result handoff',
    rootCause: 'transition-completion',
  },
  replyDeeplinkFastAbort: {
    callerCategory: 'fallback/error recovery',
    rootCause: 'fallback-recovery',
  },
  overboardRecoveryToLobby: {
    callerCategory: 'fallback/error recovery',
    rootCause: 'fallback-recovery',
  },
  removeIncomingFromQueue: {
    callerCategory: 'queue sync',
    rootCause: 'queue-sync',
  },
  'finalizeGoToBans:queueOverboard': {
    callerCategory: 'GO TO BANS',
    rootCause: 'go-to-bans',
  },
  'finalizeGoToBans:prune': {
    callerCategory: 'GO TO BANS',
    rootCause: 'go-to-bans',
  },
  completeBansOverlayCloseFromResultCta: {
    callerCategory: 'GO TO BANS',
    rootCause: 'go-to-bans',
  },
};

const UNKNOWN_META: CallerMeta = {
  callerCategory: 'other',
  rootCause: 'unknown',
};

export type CheckDismissUnexpectedCallerInput = {
  // Identity
  checkBanId: string | null;
  // Caller
  diagnosticCaller: string | null;
  reason: string;
  calledFrom: string;
  sourceFile: string;
  sourceFunction: string;
  sourceLine: string;
  // Dismiss context (all read-only, from imperative reads / refs — never render)
  dismissKind: string | null;
  dismissBanId: string | null;
  currentQueueHeadKind: string | null;
  currentQueueHeadBanId: string | null;
  queueLenBefore: number;
  nextQueueProvided: boolean;
  nextQueueLen: number | null;
  activeNotificationChain: boolean;
  notificationChainTransitioning: boolean;
  chainAdvanceWaiting: boolean;
  // Check context (imperative reads; pure render-derived values are passed null)
  checkOverlayMounted: boolean | null;
  ownerPrimaryCheckBanExists: boolean | null;
  notificationQueueShellKind: string | null;
  shellKind: string | null;
  ownerDisplayKind: string | null;
  currentHeadKind: string | null;
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

const emittedKeys = new Set<string>();

// The single one-shot console emit for this investigation. MUST be called only
// from the non-render dismissCurrentOverlay callback, immediately before the
// first business mutation (ownerShadowDispatch NOTIFICATION_DISMISSED). It does
// not mutate state, dispatch, write module-level data during render, or dump
// the queue.
export function maybeEmitCheckDismissUnexpectedCallerTrace(
  input: CheckDismissUnexpectedCallerInput,
): void {
  if (!isClientDiagTraceEnvironment()) return;

  // Only when a check head is what is being dismissed.
  if (input.dismissKind !== 'check' && input.currentQueueHeadKind !== 'check') {
    return;
  }

  const checkBanId = input.checkBanId?.trim() || null;
  if (!checkBanId) return;
  const key = checkOverlayKey(checkBanId);

  // Only when the user did NOT actually exit the check — i.e. the check is being
  // torn down on its own (no yes/no/submit/dismiss/consume/result).
  const markers = readShellCheckActionMarkers();
  if (!hasExpectedExitMarkersFalse(markers)) return;

  if (emittedKeys.has(key)) return;
  emittedKeys.add(key);

  const meta =
    (input.diagnosticCaller && CALLER_META[input.diagnosticCaller]) ||
    UNKNOWN_META;

  console.error('CHECK_DISMISS_UNEXPECTED_CALLER_TRACE', {
    // Identity
    checkBanId,
    checkOverlayKey: key,
    // Caller
    diagnosticCaller: input.diagnosticCaller,
    reason: input.reason,
    calledFrom: input.calledFrom,
    sourceFile: input.sourceFile,
    sourceFunction: input.sourceFunction,
    sourceLine: input.sourceLine,
    callerCategory: meta.callerCategory,
    // Dismiss context
    dismissKind: input.dismissKind,
    dismissBanId: input.dismissBanId,
    currentQueueHeadKind: input.currentQueueHeadKind,
    currentQueueHeadBanId: input.currentQueueHeadBanId,
    queueLenBefore: input.queueLenBefore,
    nextQueueProvided: input.nextQueueProvided,
    nextQueueLen: input.nextQueueLen,
    activeNotificationChain: input.activeNotificationChain,
    notificationChainTransitioning: input.notificationChainTransitioning,
    chainAdvanceWaiting: input.chainAdvanceWaiting,
    // Check context
    checkOverlayMounted: input.checkOverlayMounted,
    ownerPrimaryCheckBanExists: input.ownerPrimaryCheckBanExists,
    notificationQueueShellKind: input.notificationQueueShellKind,
    shellKind: input.shellKind,
    ownerDisplayKind: input.ownerDisplayKind,
    currentHeadKind: input.currentHeadKind,
    // Expected exit markers (all false when this fires)
    userPressedCheckYes: markers.userPressedCheckYes,
    userPressedCheckNo: markers.userPressedCheckNo,
    submitCheckAnswerStarted: markers.submitCheckAnswerStarted,
    checkDismissStarted: markers.checkDismissStarted,
    checkConsumed: markers.checkConsumed,
    resultArrivedAfterCheck: markers.resultArrivedAfterCheck,
    // Verdict — derived only from the real caller token
    ROOT_CAUSE_CANDIDATE: meta.rootCause,
  });
}
