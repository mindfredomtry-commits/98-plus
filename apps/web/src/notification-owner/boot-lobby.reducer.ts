/**
 * Pure BOOT / LOBBY / WHO / WHAT / LEGACY_FLOW reducer. No React. No DOM. No timers.
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

const WHAT: NotificationOwnerBootLobbyState = {
  presentation: { kind: 'WHAT', mode: 'composing-ban' },
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
        return { state, rejected: null };
      }
      if (state.presentation.kind === 'BOOT') {
        return { state, rejected: 'open-who-requires-lobby' };
      }
      if (
        state.presentation.kind !== 'LOBBY' &&
        state.presentation.kind !== 'LEGACY_FLOW' &&
        state.presentation.kind !== 'WHAT'
      ) {
        return { state, rejected: 'open-who-requires-lobby-legacy-or-what' };
      }
      return { state: WHO, rejected: null };
    }

    case 'CLOSE_WHO': {
      if (state.presentation.kind === 'LOBBY') {
        return { state, rejected: null };
      }
      if (state.presentation.kind !== 'WHO') {
        return { state, rejected: 'close-who-requires-who' };
      }
      return { state: LOBBY, rejected: null };
    }

    case 'OPEN_WHAT': {
      if (state.presentation.kind === 'WHAT') {
        // Idempotent — already WHAT.
        return { state, rejected: null };
      }
      if (state.presentation.kind === 'BOOT') {
        return { state, rejected: 'open-what-requires-non-boot' };
      }
      if (
        state.presentation.kind !== 'WHO' &&
        state.presentation.kind !== 'LOBBY' &&
        state.presentation.kind !== 'LEGACY_FLOW'
      ) {
        return { state, rejected: 'open-what-requires-who-lobby-or-legacy' };
      }
      return { state: WHAT, rejected: null };
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
        state.presentation.kind !== 'WHAT' &&
        state.presentation.kind !== 'LEGACY_FLOW'
      ) {
        return { state, rejected: 'reset-to-lobby-requires-who-what-or-legacy' };
      }
      return { state: LOBBY, rejected: null };
    }

    case 'LEAVE_WHO_FOR_LEGACY_FLOW': {
      if (state.presentation.kind === 'LEGACY_FLOW') {
        return { state, rejected: null };
      }
      if (state.presentation.kind !== 'WHO') {
        return { state, rejected: 'leave-who-requires-who' };
      }
      // Skip-WHAT path (e.g. archive → CONFIRM). Prefer OPEN_WHAT for WHO → WHAT.
      return { state: LEGACY_FLOW, rejected: null };
    }

    case 'LEAVE_WHAT_FOR_LEGACY_FLOW': {
      if (state.presentation.kind === 'LEGACY_FLOW') {
        return { state, rejected: null };
      }
      if (state.presentation.kind !== 'WHAT') {
        return { state, rejected: 'leave-what-requires-what' };
      }
      // Neutral — InstantBanFlow owns CONFIRM locally.
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
