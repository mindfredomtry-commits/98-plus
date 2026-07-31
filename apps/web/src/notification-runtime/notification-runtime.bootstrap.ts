/**
 * Stage 7 Phase 1 — bootstrap / recovery lifecycle (queue populate only).
 * Transport fetches; Runtime never auto-activates.
 */
import {
  nextRuntimeTransitionId,
  notificationItemId,
  type NotificationRuntimeStore,
} from './notification-runtime.store';
import {
  selectIsBooting,
  selectIsDirectEntry,
} from './notification-runtime.selectors';
import type {
  NotificationItem,
  RuntimeEffect,
  RuntimeSource,
} from './notification-runtime.types';

export type BootstrapOutcome =
  | 'idle'
  | 'preserved-direct'
  | 'failed'
  | 'stale'
  | 'rejected';

export function isBootstrapTransitionCurrent(
  store: NotificationRuntimeStore,
  transitionId: string,
): boolean {
  const state = store.getState();
  if (state.recovery.status === 'loading') {
    return state.recovery.transitionId === transitionId;
  }
  if (state.lifecycle.status === 'booting') {
    const expected =
      state.recovery.transitionId ?? state.lifecycle.transitionId;
    return expected === transitionId;
  }
  if (state.lifecycle.status === 'recovering') {
    const expected =
      state.recovery.transitionId ?? state.lifecycle.transitionId;
    return expected === transitionId;
  }
  return false;
}

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
 * Apply transport snapshot into FIFO queue. Never activates a surface.
 */
export function completeBootstrap(
  store: NotificationRuntimeStore,
  args: {
    transitionId: string;
    items: readonly NotificationItem[];
    pendingItemIds: readonly string[];
    consumedItemIds?: readonly string[];
    sourceVersion?: string | null;
    source?: RuntimeSource;
    asSnapshot?: boolean;
    generation?: number | null;
  },
): BootstrapOutcome {
  const { transitionId } = args;
  if (!isBootstrapTransitionCurrent(store, transitionId)) {
    return 'stale';
  }

  const source: RuntimeSource = args.source ?? 'bootstrap';
  const items = [...args.items];
  const pendingItemIds = [...args.pendingItemIds];
  const consumedItemIds = args.consumedItemIds
    ? [...args.consumedItemIds]
    : undefined;
  const sourceVersion = args.sourceVersion ?? null;
  const generation = args.generation ?? null;

  if (args.asSnapshot !== false) {
    store.dispatch({
      type: 'BOOTSTRAP_SNAPSHOT_RECEIVED',
      transitionId,
      items,
      pendingItemIds,
      consumedItemIds,
      sourceVersion,
      source,
      generation,
    });
  } else {
    store.dispatch({
      type: 'BOOTSTRAP_COMPLETED',
      transitionId,
      items,
      pendingItemIds,
      consumedItemIds,
      sourceVersion,
      source,
      generation,
    });
  }

  const state = store.getState();
  if (selectIsDirectEntry(state) || state.directEntry.deferred != null) {
    return 'preserved-direct';
  }
  return 'idle';
}

export function failBootstrap(
  store: NotificationRuntimeStore,
  args: {
    transitionId: string;
    errorCode?: string;
    source?: RuntimeSource;
  },
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

  const state = store.getState();
  if (selectIsDirectEntry(state)) return 'preserved-direct';
  return 'failed';
}

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

export function bootstrapIsInFlight(store: NotificationRuntimeStore): boolean {
  const state = store.getState();
  return (
    selectIsBooting(state) ||
    (state.recovery.status === 'loading' &&
      state.recovery.transitionId != null)
  );
}
