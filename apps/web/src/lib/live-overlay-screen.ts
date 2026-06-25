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
