'use client';

import { normalizeId } from '@/lib/normalize-json';
import {
  isExplicitNotificationDrainSource,
  shouldBlockNonExplicitNotificationDrain,
} from '@/lib/notification-chain-explicit-drain';

export {
  isExplicitNotificationDrainSource,
  shouldBlockNonExplicitNotificationDrain,
} from '@/lib/notification-chain-explicit-drain';

export type DeeplinkSingleCardKind = 'check' | 'reply';

type DeeplinkSingleCardMode = {
  kind: DeeplinkSingleCardKind;
  banId: string;
};

let mode: DeeplinkSingleCardMode | null = null;
let explicitDrainAllowed = false;

export function enableDeeplinkSingleCardMode(
  kind: DeeplinkSingleCardKind,
  banId: string,
): void {
  const normalized = normalizeId(banId);
  if (!normalized) return;
  mode = { kind, banId: normalized };
  explicitDrainAllowed = false;
  window.__debug98log?.('[DEEPLINK SINGLE CARD MODE ON]', {
    kind,
    banId: normalized,
  });
}

export function completeDeeplinkSingleCardMode(source: string): void {
  if (!mode) return;
  window.__debug98log?.('[DEEPLINK SINGLE CARD COMPLETE]', {
    kind: mode.kind,
    banId: mode.banId,
    source,
  });
  mode = null;
  explicitDrainAllowed = false;
}

export function getDeeplinkSingleCardMode(): DeeplinkSingleCardMode | null {
  return mode;
}

export function isDeeplinkSingleCardModeActive(): boolean {
  return mode != null;
}

export function allowDeeplinkExplicitNotificationDrain(source: string): void {
  explicitDrainAllowed = true;
  window.__debug98log?.('[DEEPLINK EXPLICIT DRAIN ALLOWED]', { source });
}

export function shouldBlockDeeplinkAutoDrain(source: string): boolean {
  if (!mode) return false;
  if (explicitDrainAllowed) return false;
  if (isExplicitNotificationDrainSource(source)) return false;
  return true;
}

export function isDeeplinkSingleCardCompleting(
  overlayKind: 'incoming' | 'check' | 'result' | null,
  banId: string | null,
): boolean {
  if (!mode || !banId) return false;
  if (normalizeId(banId) !== mode.banId) return false;
  if (mode.kind === 'check' && overlayKind === 'check') return true;
  if (mode.kind === 'reply' && overlayKind === 'incoming') return true;
  return false;
}

export function logDeeplinkAutoDrainBlocked(data: Record<string, unknown>): void {
  window.__debug98log?.('[DEEPLINK AUTO DRAIN BLOCKED]', data);
}

export function logDeeplinkReturnLobby(data: Record<string, unknown>): void {
  window.__debug98log?.('[DEEPLINK RETURN LOBBY]', data);
}

export function logDeeplinkAutoDrainBug(data: Record<string, unknown>): void {
  window.__debug98log?.('[DEEPLINK AUTO DRAIN BUG]', data);
}
