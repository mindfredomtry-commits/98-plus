/**
 * Stage 7 Phase 1 — residual helpers. Live production path does not use sinks.
 */
import type { OwnerActiveDisplayPatch } from '@/lib/notification-overlay-owner';
import type { QueuedOverlay } from '@/lib/overlay-queue';
import {
  mapDismissReasonToCardReason,
  projectRuntimeAdvanceSnapshot,
  projectRuntimeDisplayToLegacy,
  projectRuntimeQueueToLegacy,
} from './notification-runtime.adapters';
import {
  dismissRuntimeHead,
  notificationItemId,
  syncRuntimeQueue,
  type NotificationRuntimeStore,
} from './notification-runtime.store';
import type {
  NotificationItem,
  NotificationRuntimeState,
  RuntimeEffect,
  RuntimeSource,
} from './notification-runtime.types';

/** @deprecated Stage 7 — not used on production live path. */
export type RuntimeLegacySinks = {
  writeQueue: (queue: QueuedOverlay[], source: string) => void;
  writeDisplay: (patch: OwnerActiveDisplayPatch, source: string) => void;
  runEffects?: (effects: RuntimeEffect[]) => void;
};

export function mapProvidersSourceToRuntime(source: string): RuntimeSource {
  const s = source.toLowerCase();
  if (s.includes('bootstrap') || s.includes('startup') || s.includes('hydrate')) {
    return 'bootstrap';
  }
  if (s.includes('drain')) return 'drain';
  if (s.includes('deeplink')) return 'deeplink';
  if (
    s.includes('websocket') ||
    s.includes(':ws') ||
    s.endsWith('-ws') ||
    s.includes('ws-')
  ) {
    return 'websocket';
  }
  if (s.includes('poll')) return 'poll';
  if (s.includes('recover')) return 'recovery';
  if (
    s.includes('dismiss') ||
    s.includes('user-answer') ||
    s.includes('user') ||
    s.includes('result-cta')
  ) {
    return 'user';
  }
  if (s.includes('test')) return 'test';
  return 'system';
}

export function toQueuedOverlayItems(
  queue: readonly QueuedOverlay[],
): NotificationItem[] {
  return queue.map((item) => {
    if (item.kind === 'result') return { kind: 'result', result: item.result };
    if (item.kind === 'check') return { kind: 'check', ban: item.ban };
    return { kind: 'incoming', ban: item.ban };
  });
}

export function buildExclusiveDisplayPatchFromRuntime(
  state: NotificationRuntimeState,
): OwnerActiveDisplayPatch {
  const display = projectRuntimeDisplayToLegacy(state);
  return {
    incomingBan: display.incomingBan,
    checkBan: display.checkBan,
    result: display.result,
    directResultOverlay: display.directResultOverlay,
    directResultOverlayActive: display.directResultOverlayActive,
    stableIncomingBan: null,
    replyIncomingBan: null,
    scopedIncomingBan: null,
  };
}

export function ingestProductionQueue(
  store: NotificationRuntimeStore,
  queue: readonly QueuedOverlay[],
  source: string,
  _sinks?: RuntimeLegacySinks,
  options?: { projectLegacy?: boolean; transitionId?: string },
): NotificationRuntimeState {
  const runtimeSource = mapProvidersSourceToRuntime(source);
  return syncRuntimeQueue(
    store,
    toQueuedOverlayItems(queue),
    runtimeSource,
    options?.transitionId,
  );
}

export function dismissProductionHead(
  store: NotificationRuntimeStore,
  args: {
    targetItemId: string;
    reason: string;
    source?: string;
  },
  _sinks?: RuntimeLegacySinks,
): {
  snapshot: ReturnType<typeof projectRuntimeAdvanceSnapshot>;
  effects: RuntimeEffect[];
} {
  const result = dismissRuntimeHead(
    store,
    args.targetItemId,
    mapDismissReasonToCardReason(args.reason),
    mapProvidersSourceToRuntime(args.source ?? 'user'),
  );
  return {
    snapshot: projectRuntimeAdvanceSnapshot(result.state),
    effects: result.effects,
  };
}

export { notificationItemId, projectRuntimeQueueToLegacy };
