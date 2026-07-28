/**
 * NotificationOwner — BOOT / LOBBY / WHO macro ownership slice.
 * LEGACY_FLOW is a non-rendering handoff so owner does not project Lobby
 * while InstantBanFlow owns WHAT/CONFIRM/etc. locally.
 */

export type BootLobbyPresentation =
  | { kind: 'BOOT'; surface: 'deliberate-boot' }
  | { kind: 'LOBBY'; mode: 'full' }
  | { kind: 'WHO'; mode: 'selecting-target' }
  /** Neutral — no Lobby/WHO projection; legacy InstantBanFlow owns paint. */
  | { kind: 'LEGACY_FLOW'; mode: 'non-rendering' };

export type NotificationOwnerBootLobbyState = {
  presentation: BootLobbyPresentation;
};

export type NotificationOwnerBootLobbyInput =
  | { type: 'BOOT_COMPLETE' }
  | { type: 'OPEN_WHO' }
  | { type: 'CLOSE_WHO' }
  | { type: 'RESET_TO_LOBBY' }
  /** Leave WHO for legacy WHAT/CONFIRM/etc. Does not own WHAT. */
  | { type: 'LEAVE_WHO_FOR_LEGACY_FLOW' };

export type NotificationOwnerBootLobbyReduceResult = {
  state: NotificationOwnerBootLobbyState;
  rejected: string | null;
};

export function createInitialNotificationOwnerBootLobbyState(): NotificationOwnerBootLobbyState {
  return {
    presentation: { kind: 'BOOT', surface: 'deliberate-boot' },
  };
}
