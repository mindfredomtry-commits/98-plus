'use client';

import { resolveBansLayerOwnerDisplayKind } from '@/lib/bans-layer-open-gate';
import type { NotificationOverlayOwnerState } from '@/lib/notification-overlay-owner';

export type PlatformQueueFlowTracePlatform = {
  userAgent: string | null;
  navigatorPlatform: string | null;
  telegramWebAppPlatform: string | null;
  telegramWebAppVersion: string | null;
  viewportHeight: number | null;
  viewportStableHeight: number | null;
  documentVisibilityState: string | null;
};

export type PlatformQueueFlowTracePayload = {
  source: string;
  phase: string;
  platform: PlatformQueueFlowTracePlatform;
  ownerPendingLen?: number;
  ownerQueueLen?: number;
  pendingKinds?: string[];
  queueKinds?: string[];
  activeKind?: string | null;
  displayKind?: string | null;
  mergedCount?: number | null;
  branch?: string | null;
  timestamp: number;
};

export function readPlatformQueueFlowTracePlatform(): PlatformQueueFlowTracePlatform {
  if (typeof window === 'undefined') {
    return {
      userAgent: null,
      navigatorPlatform: null,
      telegramWebAppPlatform: null,
      telegramWebAppVersion: null,
      viewportHeight: null,
      viewportStableHeight: null,
      documentVisibilityState: null,
    };
  }
  const webApp = window.Telegram?.WebApp;
  return {
    userAgent: navigator.userAgent ?? null,
    navigatorPlatform: navigator.platform ?? null,
    telegramWebAppPlatform: webApp?.platform ?? null,
    telegramWebAppVersion: webApp?.version ?? null,
    viewportHeight:
      typeof webApp?.viewportHeight === 'number' ? webApp.viewportHeight : null,
    viewportStableHeight:
      typeof webApp?.viewportStableHeight === 'number'
        ? webApp.viewportStableHeight
        : null,
    documentVisibilityState: document.visibilityState ?? null,
  };
}

export function buildPlatformQueueFlowOwnerFields(
  owner: NotificationOverlayOwnerState,
): Pick<
  PlatformQueueFlowTracePayload,
  | 'ownerPendingLen'
  | 'ownerQueueLen'
  | 'pendingKinds'
  | 'queueKinds'
  | 'activeKind'
  | 'displayKind'
> {
  return {
    ownerPendingLen: owner.pending.length,
    ownerQueueLen: owner.queue.length,
    pendingKinds: owner.pending.map((item) => item.kind),
    queueKinds: owner.queue.map((item) => item.kind),
    activeKind: owner.active.kind,
    displayKind: resolveBansLayerOwnerDisplayKind(owner.display),
  };
}

export function logPlatformQueueFlowTrace(
  input: Omit<PlatformQueueFlowTracePayload, 'platform' | 'timestamp'> &
    Partial<Pick<PlatformQueueFlowTracePayload, 'timestamp'>> & {
      owner?: NotificationOverlayOwnerState;
    },
): void {
  if (typeof window === 'undefined') return;
  const { owner, timestamp, ...rest } = input;
  const ownerFields = owner ? buildPlatformQueueFlowOwnerFields(owner) : {};
  const payload: PlatformQueueFlowTracePayload = {
    platform: readPlatformQueueFlowTracePlatform(),
    timestamp: timestamp ?? performance.now(),
    ...ownerFields,
    ...rest,
  };
  console.log('PLATFORM_QUEUE_FLOW_TRACE', payload);
  window.__debug98log?.('PLATFORM_QUEUE_FLOW_TRACE', payload);
}
