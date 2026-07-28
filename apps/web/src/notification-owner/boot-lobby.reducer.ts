/**
 * Pure BOOT / LOBBY / WHO / WHAT / CONFIRM / LEGACY_FLOW reducer.
 * No React. No DOM. No timers.
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

const CONFIRM: NotificationOwnerBootLobbyState = {
  presentation: { kind: 'CONFIRM', mode: 'confirming' },
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
        state.presentation.kind !== 'WHAT' &&
        state.presentation.kind !== 'CONFIRM'
      ) {
        return {
          state,
          rejected: 'open-who-requires-lobby-legacy-what-or-confirm',
        };
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
        return { state, rejected: null };
      }
      if (state.presentation.kind === 'BOOT') {
        return { state, rejected: 'open-what-requires-non-boot' };
      }
      if (
        state.presentation.kind !== 'WHO' &&
        state.presentation.kind !== 'LOBBY' &&
        state.presentation.kind !== 'LEGACY_FLOW' &&
        state.presentation.kind !== 'CONFIRM'
      ) {
        return {
          state,
          rejected: 'open-what-requires-who-lobby-legacy-or-confirm',
        };
      }
      return { state: WHAT, rejected: null };
    }

    case 'OPEN_CONFIRM': {
      if (state.presentation.kind === 'CONFIRM') {
        // Idempotent — already CONFIRM.
        return { state, rejected: null };
      }
      if (state.presentation.kind === 'BOOT') {
        return { state, rejected: 'open-confirm-requires-non-boot' };
      }
      if (
        state.presentation.kind !== 'WHAT' &&
        state.presentation.kind !== 'WHO' &&
        state.presentation.kind !== 'LOBBY' &&
        state.presentation.kind !== 'LEGACY_FLOW'
      ) {
        return {
          state,
          rejected: 'open-confirm-requires-what-who-lobby-or-legacy',
        };
      }
      return { state: CONFIRM, rejected: null };
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
        state.presentation.kind !== 'CONFIRM' &&
        state.presentation.kind !== 'LEGACY_FLOW'
      ) {
        return {
          state,
          rejected: 'reset-to-lobby-requires-who-what-confirm-or-legacy',
        };
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
      return { state: LEGACY_FLOW, rejected: null };
    }

    case 'LEAVE_WHAT_FOR_LEGACY_FLOW': {
      if (state.presentation.kind === 'LEGACY_FLOW') {
        return { state, rejected: null };
      }
      if (state.presentation.kind !== 'WHAT') {
        return { state, rejected: 'leave-what-requires-what' };
      }
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
