'use client';

import type { NotificationMode } from '@98plus/shared';
import type { LiveOverlayScreen } from '@/lib/live-overlay-screen';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function logNotificationMode(data: {
  mode: NotificationMode;
  userId: string | null;
}): void {
  emit('[NOTIFICATION MODE]', data);
}

export function logLiveOverlayDisplayAllowed(data: {
  mode: NotificationMode;
  kind: string;
  banId: string;
  reason: string;
  currentScreen: LiveOverlayScreen;
}): void {
  emit('[LIVE OVERLAY DISPLAY ALLOWED]', data);
}

export function logLiveOverlayBlocked(data: {
  mode: NotificationMode;
  kind: string;
  banId: string;
  reason: string;
  currentScreen: LiveOverlayScreen;
  pendingCount: number;
}): void {
  emit('[LIVE OVERLAY BLOCKED]', data);
}

export function logLiveOverlayConsumed(data: {
  kind: string;
  banId: string;
  action: string;
}): void {
  emit('[LIVE OVERLAY CONSUMED]', data);
}
