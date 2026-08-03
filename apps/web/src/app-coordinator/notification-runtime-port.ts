/**
 * Coordinator-owned adapter: Runtime facts without activation policy.
 */
import type {
  NotificationRuntimeEventSink,
  NotificationRuntimePort,
} from './app-coordinator.ports';
import {
  executeFetchDirectItemEffect,
  flushDeferredDirectEntry as flushDeferredDirectEntryEffects,
  requestDirectEntry,
  type DirectItemTransport,
} from '@/notification-runtime/notification-runtime.direct-entry';
import type { NotificationRuntimeStore } from '@/notification-runtime/notification-runtime.store';
import type { NotificationItemKind } from '@/notification-runtime/notification-runtime.types';
import { nextRuntimeTransitionId } from '@/notification-runtime/notification-runtime.store';

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

export function createNotificationRuntimePort(input: {
  store: NotificationRuntimeStore;
  sink: NotificationRuntimeEventSink;
  fetchDirectItem: DirectItemTransport;
  getUserId?: () => string | null;
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
      const transitionId = nextRuntimeTransitionId('direct-entry');
      const requested = requestDirectEntry(input.store, {
        targetId,
        targetKind: kind,
        entrySource: 'deeplink',
        returnPolicy: 'retain_queue',
        defer: false,
        transitionId,
      });
      if (!requested.accepted || requested.deferred) return;
      const userId = input.getUserId?.() ?? '';
      void executeFetchDirectItemEffect(
        input.store,
        {
          targetId,
          targetKind: kind,
          transitionId,
          userId,
        },
        input.fetchDirectItem,
      );
    },

    flushDeferredDirectEntry() {
      if (disposed) return;
      flushDeferredDirectEntryEffects(input.store, 'system');
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
