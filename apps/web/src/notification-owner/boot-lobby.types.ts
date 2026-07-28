/**
 * NotificationOwner — BOOT / LOBBY / WHO / WHAT / CONFIRM macro ownership.
 * LEGACY_FLOW remains for any later unmigrated handoffs (not CONFIRM).
 */

export type BootLobbyPresentation =
  | { kind: 'BOOT'; surface: 'deliberate-boot' }
  | { kind: 'LOBBY'; mode: 'full' }
  | { kind: 'WHO'; mode: 'selecting-target' }
  | { kind: 'WHAT'; mode: 'composing-ban' }
  | { kind: 'CONFIRM'; mode: 'confirming' }
  /** Neutral — reserved for later unmigrated handoffs. Not used for CONFIRM. */
  | { kind: 'LEGACY_FLOW'; mode: 'non-rendering' };

export type NotificationOwnerBootLobbyState = {
  presentation: BootLobbyPresentation;
};

export type NotificationOwnerBootLobbyInput =
  | { type: 'BOOT_COMPLETE' }
  | { type: 'OPEN_WHO' }
  | { type: 'CLOSE_WHO' }
  | { type: 'OPEN_WHAT' }
  | { type: 'OPEN_CONFIRM' }
  | { type: 'RESET_TO_LOBBY' }
  /**
   * @deprecated Prefer OPEN_WHAT / OPEN_CONFIRM. Kept for any remaining skip paths.
   */
  | { type: 'LEAVE_WHO_FOR_LEGACY_FLOW' }
  /**
   * @deprecated Prefer OPEN_CONFIRM for WHAT → CONFIRM.
   */
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
