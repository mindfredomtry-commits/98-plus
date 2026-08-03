/**
 * Stage 8 Phase 8 — production Notifications Runtime store (single state model).
 */
import {
  assertNotificationRuntimeInvariant,
  notificationRuntimeReducer,
} from './notification-runtime.reducer';
import {
  logNotificationsChaos,
  nextChaosStoreId,
} from './notification-chaos-diag';
import {
  createInitialNotificationRuntimeState,
  type NotificationRuntimeEvent,
  type NotificationRuntimeReducerResult,
  type NotificationRuntimeState,
  type RuntimeEffect,
} from './notification-runtime.types';

export type NotificationRuntimeStore = {
  getState: () => NotificationRuntimeState;
  subscribe: (listener: () => void) => () => void;
  dispatch: (
    event: NotificationRuntimeEvent,
  ) => NotificationRuntimeReducerResult;
  getLastEffects: () => RuntimeEffect[];
  chaosStoreId: string;
};

let transitionSeq = 0;

export function nextRuntimeTransitionId(prefix: string): string {
  transitionSeq += 1;
  return `${prefix}:${transitionSeq}`;
}

export function createNotificationRuntimeStore(): NotificationRuntimeStore {
  let state = createInitialNotificationRuntimeState();
  let lastEffects: RuntimeEffect[] = [];
  const seenActionCommandIds = new Set<string>();
  const listeners = new Set<() => void>();
  const chaosStoreId = nextChaosStoreId();

  const emit = () => {
    for (const listener of listeners) listener();
  };

  return {
    chaosStoreId,
    getState: () => state,
    getLastEffects: () => lastEffects,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispatch(event) {
      if (event.type === 'CARD_ACTION_REQUESTED') {
        if (seenActionCommandIds.has(event.commandId)) {
          return { state, effects: [] };
        }
        seenActionCommandIds.add(event.commandId);
      }
      if (event.type === 'RESET_REQUESTED') {
        seenActionCommandIds.clear();
        transitionSeq = 0;
      }
      const before = state;
      const result = notificationRuntimeReducer(state, event);
      try {
        assertNotificationRuntimeInvariant(result.state);
      } catch {
        // Keep reducer output; invariant helper is diagnostic.
      }
      const changed = result.state !== state || result.effects.length > 0;
      state = result.state;
      lastEffects = result.effects;
      logNotificationsChaos('runtime', event.type, {
        storeId: chaosStoreId,
        source: 'source' in event ? String(event.source) : null,
        itemId:
          'targetItemId' in event
            ? String(event.targetItemId)
            : state.activeItemId,
        queueBefore: before.passiveItemIds as string[],
        queueAfter: state.passiveItemIds as string[],
        activationBefore: before.activeItemId,
        activationAfter: state.activeItemId,
        activeItemId: state.activeItemId,
        consumedIds: [],
        pendingGeneration: null,
        detail: {
          syncStatus: state.syncStatus,
          revision: state.revision,
          effects: result.effects.map((e) => e.type),
        },
      });
      if (changed) emit();
      return result;
    },
  };
}

export { notificationItemId } from './notification-runtime.types';
