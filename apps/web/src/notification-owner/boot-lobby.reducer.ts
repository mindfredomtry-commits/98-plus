/**
 * Pure BOOT / LOBBY / WHO / LEGACY_FLOW reducer. No React. No DOM. No timers.
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

const LEGACY_FLOW: NotificationOwnerBootLobbyState = {
  presentation: { kind: 'LEGACY_FLOW', mode: 'non-rendering' },
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
      if (
        state.presentation.kind !== 'LOBBY' &&
        state.presentation.kind !== 'LEGACY_FLOW'
      ) {
        return { state, rejected: 'open-who-requires-lobby-or-legacy' };
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
      if (
        state.presentation.kind !== 'WHO' &&
        state.presentation.kind !== 'LEGACY_FLOW'
      ) {
        return { state, rejected: 'reset-to-lobby-requires-who-or-legacy' };
      }
      return { state: LOBBY, rejected: null };
    }

    case 'LEAVE_WHO_FOR_LEGACY_FLOW': {
      if (state.presentation.kind === 'LEGACY_FLOW') {
        // Idempotent — already in legacy handoff.
        return { state, rejected: null };
      }
      if (state.presentation.kind !== 'WHO') {
        return { state, rejected: 'leave-who-requires-who' };
      }
      // Neutral non-rendering state — InstantBanFlow owns WHAT locally.
      return { state: LEGACY_FLOW, rejected: null };
    }

    default: {
      return {
        state,
        rejected: `unknown-input:${(input as { type: string }).type}`,
      };
    }
  }
}
