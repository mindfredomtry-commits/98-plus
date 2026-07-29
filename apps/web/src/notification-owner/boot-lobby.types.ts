/**
 * NotificationOwner — BOOT / LOBBY / WHO / WHAT / CONFIRM / SUCCESS macro ownership.
 */

export type BootLobbyPresentation =
  | { kind: 'BOOT'; surface: 'deliberate-boot' }
  | { kind: 'LOBBY'; mode: 'full' }
  | { kind: 'WHO'; mode: 'selecting-target' }
  | { kind: 'WHAT'; mode: 'composing-ban' }
  | { kind: 'CONFIRM'; mode: 'confirming' }
  | { kind: 'SUCCESS'; mode: 'send-success' };

export type NotificationOwnerBootLobbyState = {
  presentation: BootLobbyPresentation;
};

export type NotificationOwnerBootLobbyInput =
  | { type: 'BOOT_COMPLETE' }
  | { type: 'OPEN_WHO' }
  | { type: 'CLOSE_WHO' }
  | { type: 'OPEN_WHAT' }
  | { type: 'OPEN_CONFIRM' }
  | { type: 'OPEN_SUCCESS' }
  | { type: 'RESET_TO_LOBBY' };

export type NotificationOwnerBootLobbyReduceResult = {
  state: NotificationOwnerBootLobbyState;
  rejected: string | null;
};

export function createInitialNotificationOwnerBootLobbyState(): NotificationOwnerBootLobbyState {
  return {
    presentation: { kind: 'BOOT', surface: 'deliberate-boot' },
  };
}
