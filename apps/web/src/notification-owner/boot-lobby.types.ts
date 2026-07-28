/**
 * NotificationOwner — BOOT / LOBBY / WHO macro ownership slice.
 * State authority for which macro shell is active. Not a visual renderer.
 */

export type BootLobbyPresentation =
  | { kind: 'BOOT'; surface: 'deliberate-boot' }
  | { kind: 'LOBBY'; mode: 'full' }
  | { kind: 'WHO'; mode: 'selecting-target' };

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
