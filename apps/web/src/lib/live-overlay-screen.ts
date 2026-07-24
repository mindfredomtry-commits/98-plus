'use client';

import type { NotificationMode } from '@98plus/shared';

export type LiveOverlayScreen =
  | 'lobby'
  | 'who'
  | 'what'
  | 'confirm'
  | 'success'
  | 'timer'
  | 'bans'
  | 'profile'
  | 'settings'
  | 'notification'
  | 'app';

export type LiveOverlayScreenContext = {
  lobbyOpen: boolean;
  sendComposePhase: 'idle' | 'selectingTarget' | 'composingBan' | 'confirming';
  replyComposeActive: boolean;
  sendFlowOpen: boolean;
  notificationOverlayMounted: boolean;
  notificationChainTransitioning: boolean;
  notificationChainAwaitingUser: boolean;
  bansOverlayOpen: boolean;
  bansReturnToLobbyLatch: boolean;
  resultCtaBansOverlayOpen: boolean;
  bansCtaQueueSuppress: boolean;
  settingsOverlayOpen: boolean;
  profileOverlayOpen: boolean;
  successCardMounted: boolean;
  activeTimerOverlayMounted: boolean;
};

export function resolveLiveOverlayScreen(
  ctx: LiveOverlayScreenContext,
): LiveOverlayScreen {
  if (ctx.settingsOverlayOpen) return 'settings';
  if (ctx.profileOverlayOpen) return 'profile';
  if (
    ctx.bansOverlayOpen ||
    ctx.resultCtaBansOverlayOpen ||
    ctx.bansCtaQueueSuppress
  ) {
    return 'bans';
  }
  if (ctx.successCardMounted) return 'success';
  if (ctx.activeTimerOverlayMounted) return 'timer';
  if (ctx.notificationOverlayMounted) return 'notification';
  if (ctx.sendComposePhase === 'selectingTarget') return 'who';
  if (ctx.sendComposePhase === 'composingBan') return 'what';
  if (ctx.sendComposePhase === 'confirming') return 'confirm';
  if (
    ctx.lobbyOpen &&
    ctx.sendComposePhase === 'idle' &&
    !ctx.replyComposeActive &&
    !ctx.sendFlowOpen &&
    !ctx.notificationChainTransitioning &&
    !ctx.notificationChainAwaitingUser &&
    !ctx.bansReturnToLobbyLatch
  ) {
    return 'lobby';
  }
  return 'app';
}

export function isPlainLobbySurface(ctx: LiveOverlayScreenContext): boolean {
  return resolveLiveOverlayScreen(ctx) === 'lobby';
}

const LIVE_OVERLAY_BLOCKED_SCREENS: ReadonlySet<LiveOverlayScreen> = new Set([
  'who',
  'what',
  'confirm',
  'success',
  'timer',
  'bans',
  'profile',
  'settings',
  'notification',
  'app',
]);

export type LiveOverlayDisplayDecision = {
  allowed: boolean;
  reason: string;
  currentScreen: LiveOverlayScreen;
};

export function evaluateLiveOverlayDisplay(
  mode: NotificationMode,
  ctx: LiveOverlayScreenContext,
  kind: 'incoming' | 'check' | 'result',
  banId: string,
): LiveOverlayDisplayDecision {
  void kind;
  void banId;
  const currentScreen = resolveLiveOverlayScreen(ctx);
  if (mode === 'normal') {
    return { allowed: false, reason: 'normal-mode', currentScreen };
  }
  if (LIVE_OVERLAY_BLOCKED_SCREENS.has(currentScreen)) {
    return {
      allowed: false,
      reason: `blocked-on-${currentScreen}`,
      currentScreen,
    };
  }
  if (currentScreen !== 'lobby') {
    return { allowed: false, reason: 'not-plain-lobby', currentScreen };
  }
  return { allowed: true, reason: 'plain-lobby', currentScreen };
}

/**
 * Full-screen product sections where notification cards must never paint.
 * Compose (who/what/confirm) is gated separately via composeBlocksNotificationHost.
 * Success/timer/notification are runtime-owned flow surfaces — not product sections.
 */
export function productSurfaceBlocksNotificationPaint(
  ctx: LiveOverlayScreenContext,
): boolean {
  if (ctx.settingsOverlayOpen || ctx.profileOverlayOpen) return true;
  if (
    ctx.bansOverlayOpen ||
    ctx.resultCtaBansOverlayOpen ||
    ctx.bansCtaQueueSuppress
  ) {
    return true;
  }
  return false;
}

/**
 * NEW live queue presentation (bootstrap autoShow / parked flush).
 *
 * Must NOT reuse evaluateLiveOverlayDisplay's strict plain-lobby rule:
 * cold boot / lobby chrome often resolves as screen=`app` (lobbyOpen false or
 * latch), and `app` is blocked for live WS enqueue — that over-blocked bootstrap
 * autoShow and left parked items without a resume path.
 *
 * Contract: allow realtime start when no blocking product surface is visible and
 * no exclusive runtime-owned surface already owns the screen. Continuation of an
 * already-active SUCCESS/TIMER/CHECK/DEEPLINK flow does not use this gate.
 */
export function evaluateNewLiveQueuePresentation(
  mode: NotificationMode,
  ctx: LiveOverlayScreenContext,
): LiveOverlayDisplayDecision {
  const currentScreen = resolveLiveOverlayScreen(ctx);
  if (mode === 'normal') {
    return { allowed: false, reason: 'normal-mode', currentScreen };
  }
  if (productSurfaceBlocksNotificationPaint(ctx)) {
    const reasonScreen =
      currentScreen === 'bans' ||
      currentScreen === 'profile' ||
      currentScreen === 'settings'
        ? currentScreen
        : 'product-surface';
    return {
      allowed: false,
      reason: `blocked-on-${reasonScreen}`,
      currentScreen,
    };
  }
  if (ctx.successCardMounted) {
    return {
      allowed: false,
      reason: 'blocked-on-success',
      currentScreen: 'success',
    };
  }
  if (ctx.activeTimerOverlayMounted) {
    return {
      allowed: false,
      reason: 'blocked-on-timer',
      currentScreen: 'timer',
    };
  }
  if (ctx.notificationOverlayMounted) {
    return {
      allowed: false,
      reason: 'blocked-on-notification',
      currentScreen: 'notification',
    };
  }
  if (
    ctx.sendComposePhase === 'selectingTarget' ||
    ctx.sendComposePhase === 'composingBan' ||
    ctx.sendComposePhase === 'confirming' ||
    ctx.replyComposeActive ||
    ctx.sendFlowOpen
  ) {
    const reasonScreen =
      currentScreen === 'who' ||
      currentScreen === 'what' ||
      currentScreen === 'confirm'
        ? currentScreen
        : 'compose';
    return {
      allowed: false,
      reason: `blocked-on-${reasonScreen}`,
      currentScreen,
    };
  }
  // `lobby` or boot/`app` shell without a product section — eligible to start.
  return { allowed: true, reason: 'new-live-eligible', currentScreen };
}
