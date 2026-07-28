/**
 * NotificationOwner — BOOT / LOBBY / WHO / WHAT macro ownership.
 * LEGACY_FLOW is a non-rendering handoff so owner does not project Lobby/WHO/WHAT
 * while InstantBanFlow owns CONFIRM (and remaining legacy send-flow surfaces).
 */

export type BootLobbyPresentation =
  | { kind: 'BOOT'; surface: 'deliberate-boot' }
  | { kind: 'LOBBY'; mode: 'full' }
  | { kind: 'WHO'; mode: 'selecting-target' }
  | { kind: 'WHAT'; mode: 'composing-ban' }
  /** Neutral — no Lobby/WHO/WHAT projection; legacy InstantBanFlow owns CONFIRM paint. */
  | { kind: 'LEGACY_FLOW'; mode: 'non-rendering' };

export type NotificationOwnerBootLobbyState = {
  presentation: BootLobbyPresentation;
};

export type NotificationOwnerBootLobbyInput =
  | { type: 'BOOT_COMPLETE' }
  | { type: 'OPEN_WHO' }
  | { type: 'CLOSE_WHO' }
  | { type: 'OPEN_WHAT' }
  | { type: 'RESET_TO_LOBBY' }
  /**
   * @deprecated Prefer OPEN_WHAT for WHO → WHAT. Kept for WHO → CONFIRM skip-WHAT.
   */
  | { type: 'LEAVE_WHO_FOR_LEGACY_FLOW' }
  /** Leave WHAT for legacy CONFIRM (and remaining non-WHAT legacy surfaces). */
  | { type: 'LEAVE_WHAT_FOR_LEGACY_FLOW' };

export type NotificationOwnerBootLobbyReduceResult = {
  state: NotificationOwnerBootLobbyState;
  rejected: string | null;
};

export function createInitialNotificationOwnerBootLobbyState(): NotificationOwnerBootLobbyState {
  return {
    presentation: { kind: 'BOOT', surface: 'deliberate-boot' },
  };
}
