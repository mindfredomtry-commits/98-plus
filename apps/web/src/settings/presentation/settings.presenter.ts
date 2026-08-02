/**
 * Pure Settings presenter — SettingsState ↔ ViewState / UI events ↔ intents.
 * No React, no Runtime implementation, no Coordinator.
 */
import type {
  NotificationPreference,
  SettingsIntent,
  SettingsState,
} from '../settings.types';

export type SettingsViewOption = {
  id: NotificationPreference;
  label: string;
  selected: boolean;
};

export type SettingsViewState = {
  title: string;
  preferenceSectionLabel: string;
  options: SettingsViewOption[];
  closeLabel: string;
};

export type SettingsUiEvent =
  | { type: 'PREFERENCE_SELECTED'; preference: NotificationPreference }
  | { type: 'CLOSE_PRESSED' };

export type SettingsPresenterOutput =
  | { kind: 'DOMAIN'; intent: SettingsIntent }
  | { kind: 'APPLICATION'; intent: 'CLOSE_SETTINGS_REQUESTED' };

export function presentSettingsState(state: SettingsState): SettingsViewState {
  return {
    title: 'Настройки',
    preferenceSectionLabel: 'Режим уведомлений',
    options: [
      {
        id: 'NORMAL',
        label: 'Обычный режим',
        selected: state.notificationPreference === 'NORMAL',
      },
      {
        id: 'REAL_TIME',
        label: 'В реальном времени',
        selected: state.notificationPreference === 'REAL_TIME',
      },
    ],
    closeLabel: 'Закрыть',
  };
}

export function mapSettingsUiEvent(
  event: SettingsUiEvent,
): SettingsPresenterOutput {
  switch (event.type) {
    case 'PREFERENCE_SELECTED':
      return {
        kind: 'DOMAIN',
        intent: {
          type: 'NOTIFICATION_PREFERENCE_CHANGED',
          preference: event.preference,
        },
      };
    case 'CLOSE_PRESSED':
      return { kind: 'APPLICATION', intent: 'CLOSE_SETTINGS_REQUESTED' };
    default: {
      const _exhaustive: never = event;
      void _exhaustive;
      return { kind: 'APPLICATION', intent: 'CLOSE_SETTINGS_REQUESTED' };
    }
  }
}
