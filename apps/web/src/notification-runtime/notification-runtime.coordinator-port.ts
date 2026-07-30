/**
 * Production NotificationRuntimePort — private store access, scalar facts only.
 * No queue/pending array copies cross this boundary.
 */
import type {
  NotificationRuntimeEventSink,
  NotificationRuntimePort,
} from '@/app-coordinator/app-coordinator.ports';
import type { ResumeToken } from '@/app-coordinator/app-coordinator.types';
import {
  executeFetchDirectItemEffect,
  flushDeferredDirectEntry,
  requestDirectEntry,
  toDirectNotificationItem,
  type DirectItemTransport,
} from './notification-runtime.direct-entry';
import { markRuntimeItemConsumed } from './notification-runtime.pending';
import { selectCurrentItemId } from './notification-runtime.selectors';
import {
  completeRuntimeItem,
  type NotificationRuntimeStore,
} from './notification-runtime.store';
import {
  notificationItemId,
  type NotificationItemKind,
  type RuntimeEffect,
} from './notification-runtime.types';

export type NotificationRuntimePortHandle = NotificationRuntimePort & {
  dispose(): void;
  /** Called by transport when cold bootstrap settles. */
  notifyBootCompleted(currentItemId: string | null): void;
  notifyReconnectStarted(): void;
  notifyReconnectCompleted(): void;
};

type ActiveSuspension = {
  sourceItemId: string | null;
  resumeToken: ResumeToken;
};

function parseCanonicalItemId(itemId: string): {
  kind: NotificationItemKind;
  targetId: string;
} | null {
  const trimmed = itemId.trim();
  const sep = trimmed.indexOf(':');
  if (sep <= 0) return null;
  const kind = trimmed.slice(0, sep);
  const targetId = trimmed.slice(sep + 1).trim();
  if (!targetId) return null;
  if (kind !== 'incoming' && kind !== 'check' && kind !== 'result') {
    return null;
  }
  return { kind, targetId };
}

function resolveTargetKind(
  itemId: string,
  notificationKind: 'incoming' | 'status',
): { kind: NotificationItemKind | null; targetId: string } {
  const parsed = parseCanonicalItemId(itemId);
  if (parsed) return parsed;
  return {
    kind: notificationKind === 'incoming' ? 'incoming' : null,
    targetId: itemId.trim(),
  };
}

async function runDirectEffects(
  store: NotificationRuntimeStore,
  effects: readonly RuntimeEffect[],
  fetchItem: DirectItemTransport,
): Promise<void> {
  for (const effect of effects) {
    if (effect.type !== 'FETCH_DIRECT_ITEM') continue;
    await executeFetchDirectItemEffect(store, effect, fetchItem);
  }
}

export function createNotificationRuntimePort(input: {
  store: NotificationRuntimeStore;
  sink: NotificationRuntimeEventSink;
  fetchDirectItem: DirectItemTransport;
}): NotificationRuntimePortHandle {
  let disposed = false;
  let suspended: ActiveSuspension | null = null;
  let previousCurrentId: string | null = selectCurrentItemId(
    input.store.getState(),
  );
  let bootSettled = false;

  const emitCurrentOrDrained = (itemId: string | null): void => {
    if (suspended) return;
    if (itemId === null) {
      input.sink.queueDrained();
      return;
    }
    input.sink.currentChanged(itemId);
  };

  const unsubscribe = input.store.subscribe(() => {
    if (disposed) return;
    const nextId = selectCurrentItemId(input.store.getState());
    if (nextId === previousCurrentId) return;
    const previous = previousCurrentId;
    previousCurrentId = nextId;
    if (suspended) return;
    if (nextId !== null) {
      input.sink.currentChanged(nextId);
      return;
    }
    if (previous !== null) {
      input.sink.queueDrained();
    }
  });

  return {
    ingestEntry(intent) {
      if (disposed) return;
      const { kind, targetId } = resolveTargetKind(
        intent.itemId,
        intent.notificationKind,
      );
      if (!targetId) return;
      const requested = requestDirectEntry(input.store, {
        targetId,
        targetKind: kind,
        entrySource: 'deeplink',
        returnPolicy: 'lobby_after_card',
        defer: suspended !== null,
      });
      if (!requested.accepted || requested.deferred) return;
      void runDirectEffects(
        input.store,
        requested.effects,
        input.fetchDirectItem,
      );
    },

    suspend({ sourceItemId, resumeToken }) {
      if (disposed) return;
      if (!resumeToken) {
        suspended = null;
        return;
      }
      suspended = { sourceItemId, resumeToken };
    },

    resume({ resumeToken }) {
      if (disposed) return;
      if (
        suspended &&
        resumeToken !== null &&
        suspended.resumeToken !== resumeToken
      ) {
        return;
      }
      suspended = null;
      const effects = flushDeferredDirectEntry(input.store, 'system');
      void runDirectEffects(input.store, effects, input.fetchDirectItem).then(
        () => {
          if (disposed || suspended) return;
          const currentId = selectCurrentItemId(input.store.getState());
          previousCurrentId = currentId;
          emitCurrentOrDrained(currentId);
        },
      );
      if (effects.length === 0) {
        const currentId = selectCurrentItemId(input.store.getState());
        previousCurrentId = currentId;
        emitCurrentOrDrained(currentId);
      }
    },

    completeSourceItem({ sourceItemId, resumeToken }) {
      if (disposed) return;
      if (
        suspended &&
        resumeToken !== null &&
        suspended.resumeToken !== resumeToken
      ) {
        return;
      }
      const state = input.store.getState();
      const inQueue = state.items.queue.some(
        (item) => notificationItemId(item) === sourceItemId,
      );
      if (inQueue) {
        completeRuntimeItem(input.store, sourceItemId, 'user');
      } else {
        markRuntimeItemConsumed(input.store, sourceItemId, 'user');
      }
    },

    notifyBootCompleted(currentItemId) {
      if (disposed || bootSettled) return;
      bootSettled = true;
      previousCurrentId = currentItemId;
      input.sink.bootCompleted({ currentItemId });
    },

    notifyReconnectStarted() {
      if (disposed) return;
      input.sink.reconnectStarted();
    },

    notifyReconnectCompleted() {
      if (disposed) return;
      input.sink.reconnectCompleted();
    },

    dispose() {
      disposed = true;
      unsubscribe();
      suspended = null;
    },
  };
}

export { toDirectNotificationItem };
