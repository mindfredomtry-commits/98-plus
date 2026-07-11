'use client';

import { checkOverlayKey } from '@/lib/overlay-queue';
import { isClientDiagTraceEnvironment } from '@/lib/diag-trace-client';
import {
  readShellCheckActionMarkers,
  type ShellCheckActionMarkers,
} from '@/lib/shell-check-lifecycle-trace-debug';

// Post-commit fact probe. Primary trigger = the FULL lobby (arena idle CTA) is
// actually mounted/visible in the DOM. Context = a check head is still active
// (queue head + owner display === 'check', ban present). Fires regardless of
// shellKind / renderBranch / notificationOverlayVisible / transition flags, so
// it captures the real visual flicker independent of any shell/finalize
// hypothesis and reports which final-render/layering condition co-occurred.
//
// Called only from a post-commit useLayoutEffect. No render/useMemo/JSX use, no
// state writes, no DOM/queue dump, no stack. One console.error per
// checkOverlayKey. All values are passed in already computed by the caller;
// the lobby-mount booleans are the caller's single existence read of the lobby
// DOM node.

export type LobbyVisibleWithActiveCheckRootCause =
  | 'final-render-selected-no-shell-with-active-check'
  | 'final-render-branch-null-with-active-check'
  | 'shell-kind-null-with-active-check'
  | 'lobby-mounted-under-shell-result'
  | 'lobby-mounted-under-shell-check'
  | 'overlay-host-not-emitting-over-lobby'
  | 'overlay-card-content-not-mounted-over-lobby'
  | 'overlay-visibility-false-over-active-check'
  | 'lobby-and-check-overlay-coexist-layering-conflict';

export type LobbyVisibleWithActiveCheckInput = {
  // Identity
  checkBanId: string | null;
  // Lobby fact (post-commit DOM existence reads by the caller)
  lobbyMounted: boolean;
  lobbyVisible: boolean;
  lobbyRootPresent: boolean;
  lobbyComponentName: string | null;
  lobbyRenderCondition: string | null;
  lobbyRenderReason: string | null;
  pageBranch: string | null;
  topLevelReturnedBranch: string | null;
  // Final render decision
  renderBranch: string | null;
  queueHeadLifecycleRenderBranch: string | null;
  shellKind: string | null;
  notificationQueueShellKind: string | null;
  effectiveNotificationQueueShellKind: string | null;
  notificationQueueShellDisplayKindResolved: string | null;
  queueShellRendersResultOverlay: boolean;
  queueResultOverlayClaimed: boolean;
  // Queue/owner
  queueHeadKind: string | null;
  queueHeadBanId: string | null;
  queueLen: number;
  ownerDisplayKind: string | null;
  ownerDisplayBanId: string | null;
  ownerPrimaryCheckBanExists: boolean;
  queueClaimsNotificationScreen: boolean;
  // Overlay composition
  notificationOverlayVisibleDiag: boolean | null;
  globalOverlayHostActive: boolean | null;
  overlayVisualShieldCardContentMounted: boolean | null;
  visualQueueDimSessionLive: boolean;
  notificationOverlayHostMounted: boolean | null;
  notificationCardContentMounted: boolean | null;
  backdropVisible: boolean | null;
  // Result leftovers
  ownerRenderResultPayloadExists: boolean;
  activeResultPayloadExists: boolean;
  resultOverlayActive: boolean;
  directResultOverlay: boolean;
  directResultOverlayActive: boolean;
  // Transition
  activeNotificationChain: boolean;
  notificationChainTransitioning: boolean;
  chainAdvanceWaiting: boolean;
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

// Priority order per spec: distinguish (a) a final render that actually chose
// no-shell/null/null-shellKind from (b) a shell branch that stayed but lobby
// still shows through due to host/card/visibility layering.
function resolveRootCause(
  input: LobbyVisibleWithActiveCheckInput,
): LobbyVisibleWithActiveCheckRootCause {
  if (input.renderBranch === 'no-shell-branch') {
    return 'final-render-selected-no-shell-with-active-check';
  }
  if (input.renderBranch == null) {
    return 'final-render-branch-null-with-active-check';
  }
  if (input.shellKind == null) {
    return 'shell-kind-null-with-active-check';
  }
  if (input.renderBranch === 'shell-result') {
    return 'lobby-mounted-under-shell-result';
  }
  if (input.renderBranch === 'shell-check') {
    return 'lobby-mounted-under-shell-check';
  }
  if (input.globalOverlayHostActive === false) {
    return 'overlay-host-not-emitting-over-lobby';
  }
  if (input.overlayVisualShieldCardContentMounted === false) {
    return 'overlay-card-content-not-mounted-over-lobby';
  }
  if (input.notificationOverlayVisibleDiag === false) {
    return 'overlay-visibility-false-over-active-check';
  }
  return 'lobby-and-check-overlay-coexist-layering-conflict';
}

const emittedKeys = new Set<string>();

// Post-commit observer. MUST be called only from a useLayoutEffect/useEffect.
export function observeLobbyVisibleWithActiveCheckFinalRender(
  input: LobbyVisibleWithActiveCheckInput,
): void {
  if (!isClientDiagTraceEnvironment()) return;

  // Primary trigger: the full lobby is actually mounted/visible after commit.
  if (!input.lobbyMounted && !input.lobbyVisible) return;

  // Context: a check head is genuinely still active.
  if (input.queueHeadKind !== 'check') return;
  const checkBanId =
    input.checkBanId?.trim() || input.queueHeadBanId?.trim() || null;
  if (!checkBanId) return;
  if (input.ownerDisplayKind !== 'check') return;
  if (!input.ownerPrimaryCheckBanExists) return;

  // Only when the user did NOT exit the check (all exit markers false).
  const markers = readShellCheckActionMarkers();
  if (!hasExpectedExitMarkersFalse(markers)) return;

  const key = checkOverlayKey(checkBanId);
  if (emittedKeys.has(key)) return;
  emittedKeys.add(key);

  const rootCause = resolveRootCause(input);

  console.error('LOBBY_VISIBLE_WITH_ACTIVE_CHECK_FINAL_RENDER_TRACE', {
    // Identity
    checkBanId,
    checkOverlayKey: key,
    // Lobby fact
    lobbyMounted: input.lobbyMounted,
    lobbyVisible: input.lobbyVisible,
    lobbyRootPresent: input.lobbyRootPresent,
    lobbyComponentName: input.lobbyComponentName,
    lobbyRenderCondition: input.lobbyRenderCondition,
    lobbyRenderReason: input.lobbyRenderReason,
    pageBranch: input.pageBranch,
    topLevelReturnedBranch: input.topLevelReturnedBranch,
    // Final render decision
    renderBranch: input.renderBranch,
    queueHeadLifecycleRenderBranch: input.queueHeadLifecycleRenderBranch,
    shellKind: input.shellKind,
    notificationQueueShellKind: input.notificationQueueShellKind,
    effectiveNotificationQueueShellKind:
      input.effectiveNotificationQueueShellKind,
    notificationQueueShellDisplayKindResolved:
      input.notificationQueueShellDisplayKindResolved,
    queueShellRendersResultOverlay: input.queueShellRendersResultOverlay,
    queueResultOverlayClaimed: input.queueResultOverlayClaimed,
    // Queue/owner
    queueHeadKind: input.queueHeadKind,
    queueHeadBanId: input.queueHeadBanId,
    queueLen: input.queueLen,
    ownerDisplayKind: input.ownerDisplayKind,
    ownerDisplayBanId: input.ownerDisplayBanId,
    ownerPrimaryCheckBanExists: input.ownerPrimaryCheckBanExists,
    queueClaimsNotificationScreen: input.queueClaimsNotificationScreen,
    // Overlay composition
    notificationOverlayVisibleDiag: input.notificationOverlayVisibleDiag,
    globalOverlayHostActive: input.globalOverlayHostActive,
    overlayVisualShieldCardContentMounted:
      input.overlayVisualShieldCardContentMounted,
    visualQueueDimSessionLive: input.visualQueueDimSessionLive,
    notificationOverlayHostMounted: input.notificationOverlayHostMounted,
    notificationCardContentMounted: input.notificationCardContentMounted,
    backdropVisible: input.backdropVisible,
    // Result leftovers
    ownerRenderResultPayloadExists: input.ownerRenderResultPayloadExists,
    activeResultPayloadExists: input.activeResultPayloadExists,
    resultOverlayActive: input.resultOverlayActive,
    directResultOverlay: input.directResultOverlay,
    directResultOverlayActive: input.directResultOverlayActive,
    // Transition
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
    // Boolean summary
    FINAL_BRANCH_IS_NO_SHELL: input.renderBranch === 'no-shell-branch',
    FINAL_BRANCH_IS_SHELL_RESULT: input.renderBranch === 'shell-result',
    FINAL_BRANCH_IS_SHELL_CHECK: input.renderBranch === 'shell-check',
    LOBBY_AND_OVERLAY_COEXIST:
      (input.lobbyMounted || input.lobbyVisible) &&
      (input.globalOverlayHostActive === true ||
        input.overlayVisualShieldCardContentMounted === true ||
        (input.renderBranch != null &&
          input.renderBranch.startsWith('shell-'))),
    CHECK_HEAD_STILL_ACTIVE: input.queueHeadKind === 'check',
    OWNER_STILL_CHECK: input.ownerDisplayKind === 'check',
    OVERLAY_HOST_STILL_ACTIVE: input.globalOverlayHostActive === true,
    // Verdict
    ROOT_CAUSE_CANDIDATE: rootCause,
  });
}
