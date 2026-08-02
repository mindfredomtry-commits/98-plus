/**
 * Settings domain types — React-free, Coordinator-free.
 */

export type NotificationPreference = 'NORMAL' | 'REAL_TIME';

export type SettingsState = {
  notificationPreference: NotificationPreference;
};

export type SettingsIntent = {
  type: 'NOTIFICATION_PREFERENCE_CHANGED';
  preference: NotificationPreference;
};

export type SettingsEvent = SettingsIntent;

export type SettingsReduceResult = {
  state: SettingsState;
  changed: boolean;
};

export const DEFAULT_NOTIFICATION_PREFERENCE: NotificationPreference =
  'REAL_TIME';

export function createInitialSettingsState(): SettingsState {
  return {
    notificationPreference: DEFAULT_NOTIFICATION_PREFERENCE,
  };
}
