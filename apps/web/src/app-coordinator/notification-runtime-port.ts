/**
 * Coordinator-owned adapter: Runtime queue facts without activation policy.
 * Lives under app-coordinator so Notification Runtime does not import Coordinator.
 */
import type {
  NotificationRuntimeEventSink,
  NotificationRuntimePort,
} from './app-coordinator.ports';
import {
  executeFetchDirectItemEffect,
  flushDeferredDirectEntry,
  requestDirectEntry,
  toDirectNotificationItem,
  type DirectItemTransport,
} from '@/notification-runtime/notification-runtime.direct-entry';
import {
  type NotificationRuntimeStore,
} from '@/notification-runtime/notification-runtime.store';
import {
  type NotificationItemKind,
  type RuntimeEffect,
} from '@/notification-runtime/notification-runtime.types';

export type NotificationRuntimePortHandle = NotificationRuntimePort & {
  dispose(): void;
  notifyBootCompleted(): void;
  notifyReconnectStarted(): void;
  notifyReconnectCompleted(): void;
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
  let bootSettled = false;

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
        returnPolicy: 'retain_queue',
        defer: false,
      });
      if (!requested.accepted || requested.deferred) return;
      void runDirectEffects(
        input.store,
        requested.effects,
        input.fetchDirectItem,
      );
    },

    flushDeferredDirectEntry() {
      if (disposed) return;
      const effects = flushDeferredDirectEntry(input.store, 'system');
      void runDirectEffects(input.store, effects, input.fetchDirectItem);
    },

    notifyBootCompleted() {
      if (disposed || bootSettled) return;
      bootSettled = true;
      input.sink.bootCompleted();
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
    },
  };
}

export { toDirectNotificationItem };
