/**
 * Stage 3A — SUCCESS → next notification handoff contract.
 *
 * Sole owner of the SUCCESS → INCOMING / empty-Lobby presentation transition.
 * Does not own WHAT/CONFIRM/SENDING, startup, or stale-result boot.
 * Does not remount InstantBanFlow. Does not use timeouts to invent Lobby.
 *
 * Terminal outcomes (only these may clear retained SUCCESS):
 * 1. nextDisplayDomMounted(expectedDisplayId) — matching incoming card DOM painted
 *    (NOT display != null, NOT overlay host mount, NOT lifecycle presenting alone)
 * 2. runtime explicitly confirms queue empty → Lobby
 * 3. recoverable failure → keep SUCCESS (never inferred Lobby from display null)
 *
 * Phases:
 *   SUCCESS_VISIBLE → SUCCESS_HANDOFF_WAIT → NEXT_NOTIFICATION_VISIBLE
 *   SUCCESS_VISIBLE → SUCCESS_HANDOFF_WAIT → EMPTY_LOBBY_RELEASED
 */

export type SuccessToNextRuntimeDisplayKind =
  | 'incoming'
  | 'check'
  | 'result'
  | null;

export type SuccessToNextHandoffPhase =
  | 'idle'
  | 'SUCCESS_VISIBLE'
  | 'SUCCESS_HANDOFF_WAIT'
  | 'NEXT_NOTIFICATION_VISIBLE'
  | 'EMPTY_LOBBY_RELEASED';

export type SuccessToNextHandoffReleaseReason =
  | 'idle'
  | 'success-visible'
  | 'waiting-terminal'
  | 'next-display-dom-mounted'
  /** @deprecated alias — prefer next-display-dom-mounted */
  | 'runtime-materialized-and-claimed'
  | 'chain-explicitly-empty'
  | 'retain-on-failure';

export type SuccessToNextHandoffInput = {
  /** Local InstantBanFlow SUCCESS card flag. */
  banSentSuccess: boolean;
  /** Snapshot still held locally (must remain until terminal). */
  hasSuccessSnapshot: boolean;
  /**
   * Armed synchronously on SUCCESS exit BEFORE SUCCESS may clear.
   * Only SUCCESS-exit paths arm this — never startup.
   */
  handoffArmed: boolean;
  runtimeDisplayKind: SuccessToNextRuntimeDisplayKind;
  runtimeDisplayPayloadPresent: boolean;
  /**
   * Expected next display id (ban id for incoming). Required for matching DOM ack.
   * Stale mounts for a different id must not release SUCCESS.
   */
  expectedDisplayId: string | null;
  /**
   * True only when IncomingBanOverlay (or equivalent) has laid out the card DOM
   * for `expectedDisplayId` — `nextDisplayDomMounted(expectedDisplayId)`.
   */
  nextDisplayDomMounted: boolean;
  /**
   * @deprecated Not used for terminal R1. Kept for call-site compatibility /
   * diagnostics. Overlay lifecycle / host mount alone must not clear SUCCESS.
   */
  notificationPresentationClaimed: boolean;
  /** Explicit empty-chain release (not inferred from display null). */
  chainExplicitlyEmpty: boolean;
  /** Recoverable failure / ownership released — retain SUCCESS. */
  presentationOwnershipReleased: boolean;
};

export type SuccessToNextHandoffDecision = {
  phase: SuccessToNextHandoffPhase;
  releaseReason: SuccessToNextHandoffReleaseReason;
  /** Keep SuccessOverlay + snapshot mounted. */
  retainSuccessPresentation: boolean;
  /** InstantBanFlow may clear banSentSuccess + sendSnapshotRef. */
  mayClearSuccessLocal: boolean;
  /** Base Lobby orb/logo/chrome may paint. */
  allowLobbyBase: boolean;
};

function runtimeMaterializedHead(input: SuccessToNextHandoffInput): boolean {
  return input.runtimeDisplayKind != null || input.runtimeDisplayPayloadPresent;
}

/**
 * Evaluate the single SUCCESS→next handoff contract.
 * Never derives Lobby from display === null alone.
 */
export function evaluateSuccessToNextHandoff(
  input: SuccessToNextHandoffInput,
): SuccessToNextHandoffDecision {
  const successUp = input.banSentSuccess && input.hasSuccessSnapshot;

  if (!input.handoffArmed) {
    if (successUp) {
      return {
        phase: 'SUCCESS_VISIBLE',
        releaseReason: 'success-visible',
        retainSuccessPresentation: true,
        mayClearSuccessLocal: false,
        allowLobbyBase: false,
      };
    }
    return {
      phase: 'idle',
      releaseReason: 'idle',
      retainSuccessPresentation: false,
      mayClearSuccessLocal: false,
      allowLobbyBase: true,
    };
  }

  // Terminal R1a: incoming requires matching card DOM painted.
  // display != null / overlay host / lifecycle presenting alone are insufficient.
  if (
    input.runtimeDisplayKind === 'incoming' &&
    input.expectedDisplayId != null &&
    input.nextDisplayDomMounted
  ) {
    return {
      phase: 'NEXT_NOTIFICATION_VISIBLE',
      releaseReason: 'next-display-dom-mounted',
      retainSuccessPresentation: false,
      mayClearSuccessLocal: true,
      allowLobbyBase: false,
    };
  }

  // Terminal R1b: check/result — unchanged claimed path (not in this task's scope).
  if (
    (input.runtimeDisplayKind === 'check' ||
      input.runtimeDisplayKind === 'result') &&
    runtimeMaterializedHead(input) &&
    input.notificationPresentationClaimed
  ) {
    return {
      phase: 'NEXT_NOTIFICATION_VISIBLE',
      releaseReason: 'runtime-materialized-and-claimed',
      retainSuccessPresentation: false,
      mayClearSuccessLocal: true,
      allowLobbyBase: false,
    };
  }

  // Terminal R2: explicit empty release only (never display null).
  if (input.chainExplicitlyEmpty) {
    return {
      phase: 'EMPTY_LOBBY_RELEASED',
      releaseReason: 'chain-explicitly-empty',
      retainSuccessPresentation: false,
      mayClearSuccessLocal: true,
      allowLobbyBase: true,
    };
  }

  // Terminal R3: recoverable failure — keep SUCCESS, never Lobby gap.
  if (input.presentationOwnershipReleased) {
    return {
      phase: 'SUCCESS_HANDOFF_WAIT',
      releaseReason: 'retain-on-failure',
      retainSuccessPresentation: true,
      mayClearSuccessLocal: false,
      allowLobbyBase: false,
    };
  }

  // Armed, awaiting terminal — retain SUCCESS; do not infer Lobby.
  return {
    phase: 'SUCCESS_HANDOFF_WAIT',
    releaseReason: 'waiting-terminal',
    retainSuccessPresentation: true,
    mayClearSuccessLocal: false,
    allowLobbyBase: false,
  };
}
