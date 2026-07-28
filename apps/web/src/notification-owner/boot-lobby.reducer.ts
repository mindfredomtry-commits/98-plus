/**
 * Pure BOOT / LOBBY / WHO reducer. No React. No DOM. No timers.
 */

import type {
  NotificationOwnerBootLobbyInput,
  NotificationOwnerBootLobbyReduceResult,
  NotificationOwnerBootLobbyState,
} from './boot-lobby.types';

const LOBBY: NotificationOwnerBootLobbyState = {
  presentation: { kind: 'LOBBY', mode: 'full' },
};

const WHO: NotificationOwnerBootLobbyState = {
  presentation: { kind: 'WHO', mode: 'selecting-target' },
};

export function reduceNotificationOwnerBootLobby(
  state: NotificationOwnerBootLobbyState,
  input: NotificationOwnerBootLobbyInput,
): NotificationOwnerBootLobbyReduceResult {
  switch (input.type) {
    case 'BOOT_COMPLETE': {
      if (state.presentation.kind === 'LOBBY') {
        return { state, rejected: 'already-lobby' };
      }
      if (state.presentation.kind !== 'BOOT') {
        return { state, rejected: 'boot-complete-requires-boot' };
      }
      return { state: LOBBY, rejected: null };
    }

    case 'OPEN_WHO': {
      if (state.presentation.kind === 'WHO') {
        // Idempotent — already WHO.
        return { state, rejected: null };
      }
      if (state.presentation.kind === 'BOOT') {
        return { state, rejected: 'open-who-requires-lobby' };
      }
      if (state.presentation.kind !== 'LOBBY') {
        return { state, rejected: 'open-who-requires-lobby' };
      }
      return { state: WHO, rejected: null };
    }

    case 'CLOSE_WHO': {
      if (state.presentation.kind === 'LOBBY') {
        // Idempotent — already LOBBY.
        return { state, rejected: null };
      }
      if (state.presentation.kind !== 'WHO') {
        return { state, rejected: 'close-who-requires-who' };
      }
      return { state: LOBBY, rejected: null };
    }

    case 'RESET_TO_LOBBY': {
      if (state.presentation.kind === 'LOBBY') {
        return { state, rejected: null };
      }
      if (state.presentation.kind === 'BOOT') {
        return { state, rejected: 'reset-to-lobby-requires-non-boot' };
      }
      if (state.presentation.kind !== 'WHO') {
        return { state, rejected: 'reset-to-lobby-requires-who' };
      }
      return { state: LOBBY, rejected: null };
    }

    case 'LEAVE_WHO_FOR_LEGACY_FLOW': {
      if (state.presentation.kind === 'LOBBY') {
        // Idempotent — already left WHO.
        return { state, rejected: null };
      }
      if (state.presentation.kind !== 'WHO') {
        return { state, rejected: 'leave-who-requires-who' };
      }
      // Macro returns to LOBBY ownership; InstantBanFlow owns WHAT locally.
      return { state: LOBBY, rejected: null };
    }

    default: {
      return {
        state,
        rejected: `unknown-input:${(input as { type: string }).type}`,
      };
    }
  }
}
