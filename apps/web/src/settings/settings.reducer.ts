/**
 * Settings domain reducer — pure preference ownership.
 */
import {
  createInitialSettingsState,
  type SettingsEvent,
  type SettingsReduceResult,
  type SettingsState,
} from './settings.types';

export { createInitialSettingsState };

export function settingsReducer(
  state: SettingsState,
  event: SettingsEvent,
): SettingsReduceResult {
  switch (event.type) {
    case 'NOTIFICATION_PREFERENCE_CHANGED': {
      if (state.notificationPreference === event.preference) {
        return { state, changed: false };
      }
      return {
        state: { notificationPreference: event.preference },
        changed: true,
      };
    }
    default: {
      const _exhaustive: never = event;
      void _exhaustive;
      return { state, changed: false };
    }
  }
}
