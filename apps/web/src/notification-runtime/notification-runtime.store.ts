/**
 * Vertical 1 — production store for notification runtime (queue + advance only).
 * TEMP: Providers is the sole production consumer until Vertical 8 demolition.
 */
import {
  assertNotificationRuntimeInvariant,
  notificationRuntimeReducer,
} from './notification-runtime.reducer';
import { recordCommand } from './notification-runtime.command-ledger';
import {
  createInitialNotificationRuntimeState,
  notificationItemId,
  type NotificationItem,
  type NotificationRuntimeEvent,
  type NotificationRuntimeReducerResult,
  type NotificationRuntimeState,
  type RuntimeEffect,
  type RuntimeSource,
} from './notification-runtime.types';

export type NotificationRuntimeStore = {
  getState: () => NotificationRuntimeState;
  /** Subscribe for useSyncExternalStore (Vertical 2). */
  subscribe: (listener: () => void) => () => void;
  dispatch: (
    event: NotificationRuntimeEvent,
  ) => NotificationRuntimeReducerResult;
  /** Last effects from dispatch (for TEMP adapters). */
  getLastEffects: () => RuntimeEffect[];
};

let transitionSeq = 0;

/** Deterministic id factory for V1 (no crypto). */
export function nextRuntimeTransitionId(prefix: string): string {
  transitionSeq += 1;
  return `${prefix}:${transitionSeq}`;
}

export function createNotificationRuntimeStore(): NotificationRuntimeStore {
  let state = createInitialNotificationRuntimeState();
  let lastEffects: RuntimeEffect[] = [];
  /** Dedup: ignore CARD_DISMISS with same transitionId twice. */
  const seenDismissTransitionIds = new Set<string>();
  /** Dedup: ignore CARD_ACTION_REQUESTED with same commandId twice. */
  const seenActionCommandIds = new Set<string>();
  /** Vertical 5: ignore duplicate SUCCESS_HANDOFF_REQUESTED transitionId. */
  const seenSuccessHandoffTransitionIds = new Set<string>();
  /** Vertical 6: ignore duplicate DEEPLINK_ENTRY_REQUESTED transitionId. */
  const seenDeeplinkEntryTransitionIds = new Set<string>();
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) listener();
  };

  return {
    getState: () => state,
    getLastEffects: () => lastEffects,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispatch(event) {
      if (event.type === 'CARD_DISMISS_REQUESTED') {
        if (seenDismissTransitionIds.has(event.transitionId)) {
          return { state, effects: [] };
        }
        seenDismissTransitionIds.add(event.transitionId);
      }
      if (event.type === 'CARD_ACTION_REQUESTED') {
        if (seenActionCommandIds.has(event.commandId)) {
          return { state, effects: [] };
        }
        seenActionCommandIds.add(event.commandId);
      }
      if (event.type === 'SUCCESS_HANDOFF_REQUESTED') {
        if (seenSuccessHandoffTransitionIds.has(event.transitionId)) {
          return { state, effects: [] };
        }
        seenSuccessHandoffTransitionIds.add(event.transitionId);
      }
      if (event.type === 'DEEPLINK_ENTRY_REQUESTED') {
        if (seenDeeplinkEntryTransitionIds.has(event.transitionId)) {
          return { state, effects: [] };
        }
        seenDeeplinkEntryTransitionIds.add(event.transitionId);
      }
      if (event.type === 'ITEMS_RECEIVED' || event.type === 'DRAIN_FAILED') {
        // Stale batch: ignore if draining under a different transitionId.
        if (
          state.lifecycle.status === 'draining' &&
          state.lifecycle.transitionId &&
          event.transitionId !== state.lifecycle.transitionId
        ) {
          return { state, effects: [] };
        }
      }
      if (
        event.type === 'DIRECT_ITEM_RECEIVED' ||
        event.type === 'DIRECT_ITEM_FAILED'
      ) {
        const expected =
          state.directEntry.transitionId ?? state.lifecycle.transitionId;
        if (expected && event.transitionId !== expected) {
          return { state, effects: [] };
        }
      }
      if (
        event.type === 'BOOTSTRAP_COMPLETED' ||
        event.type === 'BOOTSTRAP_SNAPSHOT_RECEIVED' ||
        event.type === 'BOOTSTRAP_FAILED'
      ) {
        const expected =
          state.recovery.transitionId ?? state.lifecycle.transitionId;
        if (expected && event.transitionId !== expected) {
          return { state, effects: [] };
        }
      }
      if (event.type === 'RESET_REQUESTED') {
        seenDismissTransitionIds.clear();
        seenActionCommandIds.clear();
        seenSuccessHandoffTransitionIds.clear();
        seenDeeplinkEntryTransitionIds.clear();
        transitionSeq = 0;
      }
      const before = state;
      const result = notificationRuntimeReducer(state, event);
      // Offline invariant stays test-only; production store does not throw.
      try {
        assertNotificationRuntimeInvariant(result.state);
      } catch {
        // Keep reducer output even if invariant helper fails during migration.
      }
      const changed = result.state !== state || result.effects.length > 0;
      state = result.state;
      lastEffects = result.effects;
      // Canonical dispatch-boundary ledger (dev/test only; no-op unless flag on).
      recordCommand(event, before, result.state);
      if (changed) emit();
      return result;
    },
  };
}

export function toRuntimeItems(
  queue: readonly NotificationItem[],
): NotificationItem[] {
  return queue.map((item) => {
    if (item.kind === 'result') {
      return { kind: 'result', result: item.result };
    }
    if (item.kind === 'check') {
      return { kind: 'check', ban: item.ban };
    }
    return { kind: 'incoming', ban: item.ban };
  });
}

export function syncRuntimeQueue(
  store: NotificationRuntimeStore,
  queue: readonly NotificationItem[],
  source: RuntimeSource,
  transitionId?: string,
): NotificationRuntimeState {
  const tid = transitionId ?? nextRuntimeTransitionId('ingest');
  return store.dispatch({
    type: 'ITEMS_RECEIVED',
    transitionId: tid,
    items: toRuntimeItems(queue),
    replaceQueue: true,
    source,
  }).state;
}

export function dismissRuntimeHead(
  store: NotificationRuntimeStore,
  targetItemId: string,
  reason:
    | 'user_dismiss'
    | 'close_result'
    | 'continue_chain'
    | 'system',
  source: RuntimeSource,
  transitionId?: string,
): NotificationRuntimeReducerResult {
  const tid = transitionId ?? nextRuntimeTransitionId('dismiss');
  return store.dispatch({
    type: 'CARD_DISMISS_REQUESTED',
    transitionId: tid,
    targetItemId,
    reason,
    source,
  });
}

export function completeRuntimeItem(
  store: NotificationRuntimeStore,
  targetItemId: string,
  source: RuntimeSource,
  transitionId?: string,
): NotificationRuntimeReducerResult {
  const tid = transitionId ?? nextRuntimeTransitionId('complete');
  return store.dispatch({
    type: 'ITEM_COMPLETED',
    transitionId: tid,
    targetItemId,
    source,
  });
}

export { notificationItemId };
