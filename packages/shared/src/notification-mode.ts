export type NotificationMode = 'real-time' | 'normal';

export const DEFAULT_NOTIFICATION_MODE: NotificationMode = 'real-time';

export const NOTIFICATION_MODE_LABELS: Record<NotificationMode, string> = {
  'real-time': 'real-time',
  normal: 'normal',
};

export function normalizeNotificationMode(
  value: string | null | undefined,
): NotificationMode {
  return value === 'normal' ? 'normal' : 'real-time';
}

export function isNotificationMode(value: unknown): value is NotificationMode {
  return value === 'real-time' || value === 'normal';
}
