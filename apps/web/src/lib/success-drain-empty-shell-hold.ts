/**
 * FIX A — SUCCESS presentation handoff hold (base Lobby suppression).
 *
 * Proven failure: SUCCESS unmount revealed InstantBanFlow ArenaLobbyOrb
 * (data-base-lobby-orb) before runtime materialized the next card. The prior
 * hold required async evidence (draining / pending / prefetch / claim) that
 * often arrived only after SUCCESS was already gone.
 *
 * Invariant: once SUCCESS exit arms the handoff latch synchronously, base Lobby
 * presentation (orb + persistent logo + chrome/CTA via the derived predicate)
 * stays hidden until an explicit terminal runtime outcome — not merely because
 * display is null or successExitDraining was cleared in finally.
 *
 * Presentation-only: never mutates queue, pending, display, or consumption.
 */

export type SuccessPresentationRuntimeDisplayKind =
  | 'incoming'
  | 'check'
  | 'result'
  | null;

export type SuccessPresentationHandoffHoldInput = {
  lobbyBootIntroPrimed: boolean;
  /**
   * Synchronous latch armed in the SUCCESS exit path BEFORE SUCCESS unmounts.
   * Survives successExitDraining / postSuccessHandoff flag clears.
   */
  handoffArmed: boolean;
  runtimeLifecycle: string | null | undefined;
  runtimeDisplayKind: SuccessPresentationRuntimeDisplayKind;
  runtimeDisplayPayloadPresent: boolean;
  runtimeQueueLength: number;
  /**
   * @deprecated Not used for terminal R1. Overlay lifecycle claim alone must
   * not release the hold under an empty shell.
   */
  notificationPresentationClaimed: boolean;
  /** Matching next card DOM mounted (same ack as Stage 3A R1). */
  nextDisplayDomMounted?: boolean;
  expectedDisplayId?: string | null;
  /** Terminal: drain finished with no next item (explicit empty → Lobby). */
  chainExplicitlyEmpty: boolean;
  /** Terminal: drain/recovery failed and released presentation. */
  presentationOwnershipReleased: boolean;
  /** Bounded safety net. */
  holdExpired: boolean;
};

export type SuccessPresentationHandoffReleaseReason =
  | 'lobby-boot-not-primed'
  | 'not-armed'
  | 'next-display-dom-mounted'
  /** @deprecated alias — prefer next-display-dom-mounted */
  | 'runtime-materialized-and-claimed'
  | 'chain-explicitly-empty'
  | 'presentation-ownership-released'
  | 'hold-expired'
  | 'holding-armed-awaiting-terminal';

export type SuccessPresentationHandoffHoldDecision = {
  hold: boolean;
  releaseReason: SuccessPresentationHandoffReleaseReason;
};

/** Longer than a normal handoff prefetch; short enough to never strand blank. */
export const SUCCESS_PRESENTATION_HANDOFF_HOLD_MAX_MS = 8000;

/** @deprecated alias — prefer SUCCESS_PRESENTATION_HANDOFF_HOLD_MAX_MS */
export const SUCCESS_DRAIN_EMPTY_SHELL_HOLD_MAX_MS =
  SUCCESS_PRESENTATION_HANDOFF_HOLD_MAX_MS;

function runtimeMaterializedHead(
  input: SuccessPresentationHandoffHoldInput,
): boolean {
  return input.runtimeDisplayKind != null || input.runtimeDisplayPayloadPresent;
}

/**
 * Hold while the SUCCESS handoff latch is armed, until an explicit terminal
 * release. Does NOT require draining/pending/prefetch evidence to enter.
 */
export function evaluateSuccessPresentationHandoffHold(
  input: SuccessPresentationHandoffHoldInput,
): SuccessPresentationHandoffHoldDecision {
  if (!input.lobbyBootIntroPrimed) {
    return { hold: false, releaseReason: 'lobby-boot-not-primed' };
  }
  if (!input.handoffArmed) {
    return { hold: false, releaseReason: 'not-armed' };
  }
  // Terminal R1a: incoming requires matching card DOM painted.
  if (
    input.runtimeDisplayKind === 'incoming' &&
    input.expectedDisplayId != null &&
    input.nextDisplayDomMounted === true
  ) {
    return {
      hold: false,
      releaseReason: 'next-display-dom-mounted',
    };
  }
  // Terminal R1b: check/result — claimed path (result behavior unchanged).
  if (
    (input.runtimeDisplayKind === 'check' ||
      input.runtimeDisplayKind === 'result') &&
    runtimeMaterializedHead(input) &&
    input.notificationPresentationClaimed
  ) {
    return {
      hold: false,
      releaseReason: 'runtime-materialized-and-claimed',
    };
  }
  // Terminal R3: recovery/failure released presentation.
  if (input.presentationOwnershipReleased) {
    return {
      hold: false,
      releaseReason: 'presentation-ownership-released',
    };
  }
  // Terminal R2: chain explicitly empty → complete Lobby may render.
  // Callers may derive this from runtime idle+empty when SUCCESS handoff is
  // not awaiting a next card (Stage 6B Phase 3). While handoff is armed for a
  // next display, idle+null must still hold (Fix A / no orb flash).
  if (input.chainExplicitlyEmpty) {
    return { hold: false, releaseReason: 'chain-explicitly-empty' };
  }
  if (input.holdExpired) {
    return { hold: false, releaseReason: 'hold-expired' };
  }
  // Armed + no terminal yet — keep holding even with display null / no pending.
  return { hold: true, releaseReason: 'holding-armed-awaiting-terminal' };
}

/** Back-compat name used by earlier Fix A wiring/tests. */
export type SuccessDrainEmptyShellHoldInput = SuccessPresentationHandoffHoldInput & {
  /** @deprecated ignored — latch is handoffArmed */
  successHandoffOwnsPresentation?: boolean;
  /** @deprecated ignored — empty is chainExplicitlyEmpty */
  drainCompletedEmpty?: boolean;
};

export type SuccessDrainEmptyShellHoldReleaseReason =
  SuccessPresentationHandoffReleaseReason;

export type SuccessDrainEmptyShellHoldDecision =
  SuccessPresentationHandoffHoldDecision;

/**
 * Adapter: maps legacy input shape onto the latch-based evaluator.
 * `handoffArmed` wins; if omitted, falls back to successHandoffOwnsPresentation
 * only for older call sites (must not be used for the product path).
 */
export function evaluateSuccessDrainEmptyShellHold(
  input: SuccessDrainEmptyShellHoldInput,
): SuccessDrainEmptyShellHoldDecision {
  return evaluateSuccessPresentationHandoffHold({
    lobbyBootIntroPrimed: input.lobbyBootIntroPrimed,
    handoffArmed:
      input.handoffArmed ?? input.successHandoffOwnsPresentation ?? false,
    runtimeLifecycle: input.runtimeLifecycle,
    runtimeDisplayKind: input.runtimeDisplayKind,
    runtimeDisplayPayloadPresent: input.runtimeDisplayPayloadPresent,
    runtimeQueueLength: input.runtimeQueueLength,
    notificationPresentationClaimed: input.notificationPresentationClaimed,
    nextDisplayDomMounted: input.nextDisplayDomMounted,
    expectedDisplayId: input.expectedDisplayId,
    chainExplicitlyEmpty:
      input.chainExplicitlyEmpty ?? input.drainCompletedEmpty ?? false,
    presentationOwnershipReleased: input.presentationOwnershipReleased,
    holdExpired: input.holdExpired,
  });
}

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

/**
 * Unified presentation predicate: when true, hide base orb, persistent logo,
 * Lobby chrome, and Lobby CTA together. Presentation-only — no runtime writes.
 */
export function notificationTransitionOwnsPresentation(input: {
  successPresentationHandoffHold: boolean;
  interactiveActionOwnsPresentation: boolean;
}): boolean {
  return (
    input.successPresentationHandoffHold ||
    input.interactiveActionOwnsPresentation
  );
}
