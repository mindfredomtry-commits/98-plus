'use client';

import { checkOverlayKey } from '@/lib/overlay-queue';
import { isClientDiagTraceEnvironment } from '@/lib/diag-trace-client';
import {
  readShellCheckActionMarkers,
  type ShellCheckActionMarkers,
} from '@/lib/shell-check-lifecycle-trace-debug';

// AFTER the identity-safe guard: the check head was correctly PRESERVED (finalize
// did NOT dismiss it), yet lobby still briefly flickered. This probe records the
// render/handoff state at the moment finalize decided "не dismiss", to determine
// which flag temporarily makes the overlay invisible while the check is still the
// queue head.
//
// Event/callback-path only (inside finalizeResultForGoToBans, right after the
// mismatch decision). NOT a render probe: no useMemo/JSX, no module writes during
// render, no stack, no snapshot, no queue dump. One console.error per
// checkOverlayKey. All render values are read from EXISTING post-commit
// diagnostic refs (never re-derived in render).

export type CheckHeadPreservedButLobbyRenderedRootCause =
  | 'check-head-preserved-but-shell-kind-null'
  | 'check-head-preserved-but-owner-display-cleared'
  | 'check-head-preserved-but-overlay-not-visible'
  | 'check-head-preserved-but-visual-shield-unmounted'
  | 'check-head-preserved-but-host-not-emitting'
  | 'check-head-preserved-but-lobby-branch-selected'
  | 'transition-gap-after-result-finalize'
  | 'unknown';

export type CheckHeadPreservedButLobbyRenderedInput = {
  // Identity
  checkBanId: string | null;
  finalizeResultBanId: string | null;
  currentQueueHeadKind: string | null;
  currentQueueHeadBanId: string | null;
  queueLen: number;
  // Lifecycle
  notificationChainTransitioning: boolean;
  chainAdvanceWaiting: boolean;
  activeNotificationChain: boolean;
  notificationQueueShellKind: string | null;
  ownerDisplayKind: string | null;
  ownerDisplayBanId: string | null;
  ownerPrimaryCheckBanExists: boolean | null;
  // Render/handoff snapshot (from post-commit diagnostic refs)
  checkOverlayMounted: boolean | null;
  notificationOverlayVisibleDiag: boolean | null;
  visualQueueDimSessionLive: boolean;
  globalOverlayHostActive: boolean | null;
  overlayVisualShieldCardContentMounted: boolean | null;
  shellKind: string | null;
  renderBranch: string | null;
  lobbyVisible: boolean;
  queueClaimsNotificationScreen: boolean;
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

// Derived strictly from the observed render/handoff values (never invented),
// ordered from most-specific invisibility root to most-general symptom.
function resolveRootCause(
  input: CheckHeadPreservedButLobbyRenderedInput,
): CheckHeadPreservedButLobbyRenderedRootCause {
  if (input.ownerDisplayKind !== 'check') {
    return 'check-head-preserved-but-owner-display-cleared';
  }
  if (input.shellKind == null) {
    return 'check-head-preserved-but-shell-kind-null';
  }
  if (input.overlayVisualShieldCardContentMounted === false) {
    return 'check-head-preserved-but-visual-shield-unmounted';
  }
  if (input.globalOverlayHostActive === false) {
    return 'check-head-preserved-but-host-not-emitting';
  }
  if (input.notificationOverlayVisibleDiag === false) {
    return 'check-head-preserved-but-overlay-not-visible';
  }
  if (input.notificationChainTransitioning || input.chainAdvanceWaiting) {
    return 'transition-gap-after-result-finalize';
  }
  if (input.lobbyVisible) {
    return 'check-head-preserved-but-lobby-branch-selected';
  }
  return 'unknown';
}

const emittedKeys = new Set<string>();

// Console emit DISABLED. Superseded by the single post-commit trace
// RESULT_SHELL_STUCK_WHILE_CHECK_READY_TRACE, which pinpoints the exact
// shell-transition guard that holds the result shell after the head became
// check. This probe only proved the discrepancy existed; the new one localizes
// it. Kept as a no-op (call site preserved) so nothing else emits. `let` (not
// `const`) so the guard below is not narrowed to unreachable code.
let checkHeadPreservedTraceEnabled = false;

// The single one-shot console emit. MUST be called only from the non-render
// finalizeResultForGoToBans callback, immediately after the mismatch decision
// (finalize did NOT dismiss the preserved check head).
export function maybeEmitCheckHeadPreservedButLobbyRenderedTrace(
  input: CheckHeadPreservedButLobbyRenderedInput,
): void {
  if (!checkHeadPreservedTraceEnabled) return;
  if (!isClientDiagTraceEnvironment()) return;

  // Only when the preserved head is actually a check.
  if (input.currentQueueHeadKind !== 'check') return;

  const checkBanId = input.checkBanId?.trim() || null;
  if (!checkBanId) return;
  const key = checkOverlayKey(checkBanId);

  // Only when the user did NOT exit the check (all exit markers false).
  const markers = readShellCheckActionMarkers();
  if (!hasExpectedExitMarkersFalse(markers)) return;

  if (emittedKeys.has(key)) return;
  emittedKeys.add(key);

  console.error('CHECK_HEAD_PRESERVED_BUT_LOBBY_RENDERED_TRACE', {
    // Identity
    checkBanId,
    checkOverlayKey: key,
    finalizeResultBanId: input.finalizeResultBanId,
    currentQueueHeadKind: input.currentQueueHeadKind,
    currentQueueHeadBanId: input.currentQueueHeadBanId,
    queueLen: input.queueLen,
    queueHeadPreserved: true,
    // Lifecycle
    notificationChainTransitioning: input.notificationChainTransitioning,
    chainAdvanceWaiting: input.chainAdvanceWaiting,
    activeNotificationChain: input.activeNotificationChain,
    notificationQueueShellKind: input.notificationQueueShellKind,
    ownerDisplayKind: input.ownerDisplayKind,
    ownerDisplayBanId: input.ownerDisplayBanId,
    ownerPrimaryCheckBanExists: input.ownerPrimaryCheckBanExists,
    // Render/handoff snapshot
    checkOverlayMounted: input.checkOverlayMounted,
    notificationOverlayVisibleDiagRef: input.notificationOverlayVisibleDiag,
    visualQueueDimSessionLive: input.visualQueueDimSessionLive,
    globalOverlayHostActive: input.globalOverlayHostActive,
    overlayVisualShieldCardContentMounted:
      input.overlayVisualShieldCardContentMounted,
    shellKind: input.shellKind,
    renderBranch: input.renderBranch,
    lobbyVisible: input.lobbyVisible,
    queueClaimsNotificationScreen: input.queueClaimsNotificationScreen,
    // Expected exit markers (all false when this fires)
    userPressedCheckYes: markers.userPressedCheckYes,
    userPressedCheckNo: markers.userPressedCheckNo,
    submitCheckAnswerStarted: markers.submitCheckAnswerStarted,
    checkDismissStarted: markers.checkDismissStarted,
    checkConsumed: markers.checkConsumed,
    resultArrivedAfterCheck: markers.resultArrivedAfterCheck,
    // Verdict
    ROOT_CAUSE_CANDIDATE: resolveRootCause(input),
  });
}
