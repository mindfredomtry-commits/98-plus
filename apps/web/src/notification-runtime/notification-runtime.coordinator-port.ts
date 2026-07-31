/**
 * Stage 7 Phase 1 — Runtime port: facts without mute/suspend memory.
 * No hidden fact suppression. Suspend/resume are explicit no-ops until
 * the future suspended-lifecycle contract lands.
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
import { selectReadyHeadId } from './notification-runtime.selectors';
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
  /** Called by transport when cold bootstrap settles. Always reports null ready activation. */
  notifyBootCompleted(_readyHeadId: string | null): void;
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

  // Stage 7 Phase 1: do not emit currentChanged/queueDrained from queue mutations.
  // Activation policy is intentionally absent — facts must not auto-switch AppMode.
  const unsubscribe = input.store.subscribe(() => {
    if (disposed) return;
    void selectReadyHeadId(input.store.getState());
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

    suspend(_args: {
      sourceItemId: string | null;
      resumeToken: ResumeToken | null;
    }) {
      // Stage 7 Phase 1 — no mute memory; reply handoff temporarily unavailable.
      if (disposed) return;
    },

    resume(_args: { resumeToken: ResumeToken | null }) {
      if (disposed) return;
      const effects = flushDeferredDirectEntry(input.store, 'system');
      void runDirectEffects(input.store, effects, input.fetchDirectItem);
    },

    completeSourceItem({ sourceItemId }) {
      if (disposed) return;
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

    notifyBootCompleted(_readyHeadId) {
      if (disposed || bootSettled) return;
      bootSettled = true;
      // Never auto-open: boot always reports no activated notification.
      input.sink.bootCompleted({ currentItemId: null });
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
    },
  };
}

export { toDirectNotificationItem };
