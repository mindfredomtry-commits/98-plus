/**
 * FIX A — SUCCESS-drain empty-shell Lobby presentation hold.
 *
 * Proven production failure (success-prod-trace5):
 *   successExitDraining + runtime.lifecycle idle→draining + runtime.display=null
 *   + runtime.queue empty + pending chain / prefetch active
 *   → InstantBanFlow paints `lobby-shell-render` with showLobbyOrb=true behind a
 *     notification shell that has no children, ~1.1s before IncomingBanOverlay.
 *
 * Root cause: the base lobby orb layer had no SUCCESS-drain gate. `showLobbyOrb`
 * only consulted `holdLobbyOrbForBootstrap`; `successExitDraining` gated chrome
 * and CTA but never the orb.
 *
 * Invariant: while the SUCCESS handoff actively owns presentation and is awaiting
 * materialization, no Lobby content paints behind the empty notification shell.
 * The hold suppresses paint only — it never touches queue, pending, display,
 * consumption or CTA eligibility.
 */

export type SuccessDrainEmptyShellRuntimeDisplayKind =
  | 'incoming'
  | 'check'
  | 'result'
  | null;

export type SuccessDrainEmptyShellHoldInput = {
  /** Cold boot owns its own orb; the hold is a post-boot lobby gate only. */
  lobbyBootIntroPrimed: boolean;
  /** successExitDraining / post-success handoff still owns presentation. */
  successHandoffOwnsPresentation: boolean;
  runtimeLifecycle: string | null | undefined;
  runtimeDisplayKind: SuccessDrainEmptyShellRuntimeDisplayKind;
  runtimeDisplayPayloadPresent: boolean;
  runtimeQueueLength: number;
  runtimePendingCount: number;
  /** Runtime overlay lifecycle currently claims the notification screen. */
  notificationPresentationClaimed: boolean;
  /** Handoff prefetch/materialize still in flight. */
  drainPrefetchInFlight: boolean;
  /** Terminal: drain finished with no next item. */
  drainCompletedEmpty: boolean;
  /** Terminal: drain failed / recovery released presentation ownership. */
  presentationOwnershipReleased: boolean;
  /** Bounded safety net so a stuck drain can never blank the screen. */
  holdExpired: boolean;
};

export type SuccessDrainEmptyShellHoldReleaseReason =
  | 'lobby-boot-not-primed'
  | 'runtime-materialized-head'
  | 'presentation-ownership-released'
  | 'drain-completed-empty'
  | 'not-success-handoff'
  | 'hold-expired'
  | 'nothing-awaiting-materialization'
  | 'holding-awaiting-materialization';

export type SuccessDrainEmptyShellHoldDecision = {
  hold: boolean;
  releaseReason: SuccessDrainEmptyShellHoldReleaseReason;
};

/** Default bound: longer than a normal handoff prefetch, short enough to never strand. */
export const SUCCESS_DRAIN_EMPTY_SHELL_HOLD_MAX_MS = 2500;

function runtimeMaterializedHead(
  input: SuccessDrainEmptyShellHoldInput,
): boolean {
  return input.runtimeDisplayKind != null || input.runtimeDisplayPayloadPresent;
}

/**
 * Release order is deliberate: every terminal/ownership signal wins over the
 * hold, so the hold is only ever true inside the transient handoff window.
 */
export function evaluateSuccessDrainEmptyShellHold(
  input: SuccessDrainEmptyShellHoldInput,
): SuccessDrainEmptyShellHoldDecision {
  if (!input.lobbyBootIntroPrimed) {
    return { hold: false, releaseReason: 'lobby-boot-not-primed' };
  }
  // R1 — runtime materialized incoming/check/result.
  if (runtimeMaterializedHead(input)) {
    return { hold: false, releaseReason: 'runtime-materialized-head' };
  }
  // R3 — recovery/failure released presentation.
  if (input.presentationOwnershipReleased) {
    return { hold: false, releaseReason: 'presentation-ownership-released' };
  }
  // R2 — drain completed explicitly with no next item.
  if (input.drainCompletedEmpty) {
    return { hold: false, releaseReason: 'drain-completed-empty' };
  }
  if (!input.successHandoffOwnsPresentation) {
    return { hold: false, releaseReason: 'not-success-handoff' };
  }
  if (input.holdExpired) {
    return { hold: false, releaseReason: 'hold-expired' };
  }
  const awaitingMaterialization =
    input.drainPrefetchInFlight ||
    input.notificationPresentationClaimed ||
    input.runtimeLifecycle === 'draining' ||
    input.runtimeQueueLength > 0 ||
    input.runtimePendingCount > 0;
  if (!awaitingMaterialization) {
    return { hold: false, releaseReason: 'nothing-awaiting-materialization' };
  }
  return { hold: true, releaseReason: 'holding-awaiting-materialization' };
}

/**
 * Base lobby orb layers under the hold.
 * Cold boot (`!lobbyBootIntroPrimed`) is untouched — the hold cannot be true there.
 */
export function resolveLobbyOrbLayersWithSuccessDrainHold(input: {
  hold: boolean;
  lobbyBootIntroPrimed: boolean;
  holdLobbyOrbForBootstrap: boolean;
}): { showBootOrb: boolean; showLobbyOrb: boolean } {
  const showBootOrb =
    (!input.lobbyBootIntroPrimed || input.holdLobbyOrbForBootstrap) &&
    !input.hold;
  const showLobbyOrb =
    input.lobbyBootIntroPrimed && !input.holdLobbyOrbForBootstrap && !input.hold;
  return { showBootOrb, showLobbyOrb };
}
