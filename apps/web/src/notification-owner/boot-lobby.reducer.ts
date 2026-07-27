/**
 * Pure BOOT → LOBBY reducer. No React. No DOM. No timers.
 */

import type {
  NotificationOwnerBootLobbyInput,
  NotificationOwnerBootLobbyReduceResult,
  NotificationOwnerBootLobbyState,
} from './boot-lobby.types';

export function reduceNotificationOwnerBootLobby(
  state: NotificationOwnerBootLobbyState,
  input: NotificationOwnerBootLobbyInput,
): NotificationOwnerBootLobbyReduceResult {
  if (input.type !== 'BOOT_COMPLETE') {
    return { state, rejected: `unknown-input:${(input as { type: string }).type}` };
  }

  if (state.presentation.kind === 'LOBBY') {
    return { state, rejected: 'already-lobby' };
  }

  if (state.presentation.kind !== 'BOOT') {
    return { state, rejected: 'boot-complete-requires-boot' };
  }

  return {
    state: {
      presentation: { kind: 'LOBBY', mode: 'full' },
    },
    rejected: null,
  };
}
