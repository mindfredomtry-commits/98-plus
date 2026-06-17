'use client';

export type ReplyStartupBlockersSnapshot = {
  isBooting: boolean;
  isLobbyBootVisible: boolean;
  isRouteTransitioning: boolean;
  isOverlayLocked: boolean;
  isNotificationQueueLocked: boolean;
  isAdvancingQueue: boolean;
  dimVisible: boolean;
  blurVisible: boolean;
};

export function logReplyStartupBlockers(
  snapshot: ReplyStartupBlockersSnapshot,
  extra?: Record<string, unknown>,
): void {
  window.__debug98log?.('[ACTIVE BLOCKERS]', { ...snapshot, ...extra });
}

export function logReplyDeeplinkStart(data: Record<string, unknown>): void {
  window.__debug98log?.('[REPLY DEEPLINK START]', data);
}

export function logStartupBlockersClear(data: Record<string, unknown>): void {
  window.__debug98log?.('[STARTUP BLOCKERS CLEAR]', data);
}

export function logReplyCardOverlaySet(data: Record<string, unknown>): void {
  window.__debug98log?.('[REPLY CARD OVERLAY SET]', data);
}

export function logReplyCardMounted(data: Record<string, unknown>): void {
  window.__debug98log?.('[REPLY CARD MOUNTED]', data);
}
