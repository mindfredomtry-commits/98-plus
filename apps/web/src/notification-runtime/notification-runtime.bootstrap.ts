/**
 * Vertical 7 — bootstrap / recovery lifecycle (runtime sole owner).
 * Transport fetches only; overlay / badge / lobby decided by reducer.
 */
import type { OwnerActiveDisplayPatch } from '@/lib/notification-overlay-owner';
import type { QueuedOverlay } from '@/lib/overlay-queue';
import {
  buildExclusiveDisplayPatchFromRuntime,
  toQueuedOverlayItems,
  type RuntimeLegacySinks,
} from './notification-runtime.production-advance';
import {
  nextRuntimeTransitionId,
  notificationItemId,
  type NotificationRuntimeStore,
} from './notification-runtime.store';
import {
  selectIsBooting,
  selectIsDirectEntry,
  selectLobbyMayShow,
  selectOverlayVisible,
} from './notification-runtime.selectors';
import { projectRuntimeQueueToLegacy } from './notification-runtime.adapters';
import type {
  NotificationItem,
  RuntimeEffect,
  RuntimeSource,
} from './notification-runtime.types';

export type BootstrapNotificationMode = 'normal' | 'real-time';

export type BootstrapOutcome =
  | 'showing'
  | 'idle'
  | 'preserved-direct'
  | 'failed'
  | 'stale'
  | 'rejected';

function projectAfterBootstrap(
  store: NotificationRuntimeStore,
  sinks: RuntimeLegacySinks,
  source: string,
): void {
  const state = store.getState();
  sinks.writeQueue(
    projectRuntimeQueueToLegacy(state),
    `v7-bootstrap:${source}`,
  );
  sinks.writeDisplay(
    buildExclusiveDisplayPatchFromRuntime(state),
    `v7-bootstrap-display:${source}`,
  );
  sinks.runEffects?.(store.getLastEffects());
}

export function isBootstrapTransitionCurrent(
  store: NotificationRuntimeStore,
  transitionId: string,
): boolean {
  const state = store.getState();
  const expected =
    state.recovery.transitionId ?? state.lifecycle.transitionId;
  return expected === transitionId;
}

/**
 * Begin production bootstrap (cold / reload / visibility / WS reconnect).
 * Newer transitionId replaces an in-flight boot (stale completes ignored).
 */
export function requestBootstrap(
  store: NotificationRuntimeStore,
  args?: {
    transitionId?: string;
    source?: RuntimeSource;
  },
): {
  accepted: boolean;
  transitionId: string;
  preservedDirect: boolean;
  effects: RuntimeEffect[];
} {
  const transitionId =
    args?.transitionId ?? nextRuntimeTransitionId('bootstrap');
  const source: RuntimeSource = args?.source ?? 'bootstrap';

  const before = store.getState();
  const preservedDirect =
    selectIsDirectEntry(before) || before.directEntry.deferred != null;

  const result = store.dispatch({
    type: 'BOOTSTRAP_REQUESTED',
    transitionId,
    source,
  });

  const after = store.getState();
  const accepted =
    after.recovery.transitionId === transitionId ||
    (after.lifecycle.status === 'booting' &&
      after.lifecycle.transitionId === transitionId);

  return {
    accepted,
    transitionId,
    preservedDirect,
    effects: result.effects,
  };
}

/**
 * Apply transport snapshot. Mode decides auto-show (real-time) vs badge-only (normal).
 * Consumed ids never enter display. Stale transitionId → ignore.
 */
export function completeBootstrap(
  store: NotificationRuntimeStore,
  args: {
    transitionId: string;
    items: readonly NotificationItem[];
    pendingItemIds: readonly string[];
    consumedItemIds?: readonly string[];
    mode: BootstrapNotificationMode;
    sourceVersion?: string | null;
    source?: RuntimeSource;
    /** Prefer SNAPSHOT event name for transport clarity (same reducer path). */
    asSnapshot?: boolean;
  },
  sinks?: RuntimeLegacySinks,
): BootstrapOutcome {
  const { transitionId } = args;
  if (!isBootstrapTransitionCurrent(store, transitionId)) {
    return 'stale';
  }

  const source: RuntimeSource = args.source ?? 'bootstrap';
  const autoShow = args.mode === 'real-time';
  const items = [...args.items];
  const pendingItemIds = [...args.pendingItemIds];
  const consumedItemIds = args.consumedItemIds
    ? [...args.consumedItemIds]
    : undefined;
  const sourceVersion = args.sourceVersion ?? null;

  if (args.asSnapshot !== false) {
    store.dispatch({
      type: 'BOOTSTRAP_SNAPSHOT_RECEIVED',
      transitionId,
      items,
      pendingItemIds,
      consumedItemIds,
      autoShow,
      sourceVersion,
      source,
    });
  } else {
    store.dispatch({
      type: 'BOOTSTRAP_COMPLETED',
      transitionId,
      items,
      pendingItemIds,
      consumedItemIds,
      autoShow,
      sourceVersion,
      source,
    });
  }

  if (sinks) {
    projectAfterBootstrap(store, sinks, args.mode);
  }

  const state = store.getState();
  if (selectIsDirectEntry(state) || state.directEntry.deferred != null) {
    return 'preserved-direct';
  }
  if (selectOverlayVisible(state)) return 'showing';
  return 'idle';
}

export function failBootstrap(
  store: NotificationRuntimeStore,
  args: {
    transitionId: string;
    errorCode?: string;
    source?: RuntimeSource;
  },
  sinks?: RuntimeLegacySinks,
): BootstrapOutcome {
  const { transitionId } = args;
  if (!isBootstrapTransitionCurrent(store, transitionId)) {
    return 'stale';
  }

  store.dispatch({
    type: 'BOOTSTRAP_FAILED',
    transitionId,
    errorCode: args.errorCode ?? 'BOOTSTRAP_FAILED',
    source: args.source ?? 'bootstrap',
  });

  if (sinks) {
    projectAfterBootstrap(store, sinks, 'failed');
  }

  const state = store.getState();
  if (selectIsDirectEntry(state)) return 'preserved-direct';
  return 'failed';
}

/** Build pending ids from notification items (deduped). */
export function pendingIdsFromBootstrapItems(
  items: readonly NotificationItem[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const id = notificationItemId(item);
    if (!id.includes(':') || id.endsWith(':') || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function queuedOverlaysToBootstrapItems(
  items: readonly QueuedOverlay[],
): NotificationItem[] {
  return toQueuedOverlayItems(items);
}

/** Host: after bootstrap idle, lobby only via selectLobbyMayShow. */
export function bootstrapAllowsHostLobby(
  store: NotificationRuntimeStore,
): boolean {
  return selectLobbyMayShow(store.getState());
}

export function bootstrapIsInFlight(store: NotificationRuntimeStore): boolean {
  const state = store.getState();
  return (
    selectIsBooting(state) ||
    (state.recovery.status === 'loading' &&
      state.recovery.transitionId != null)
  );
}

export type { OwnerActiveDisplayPatch };
