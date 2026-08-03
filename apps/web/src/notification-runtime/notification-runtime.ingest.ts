/**
 * Stage 8 correction — ingest boundary does NOT write Runtime items.
 *
 * Ban/WS/pending payloads lack journal sequence/revision. Fabricating them
 * is forbidden. Phase 9 Sync API is the only item authority.
 */
import type { BanInteraction, BanResult } from '@98plus/shared';
import {
  itemFromCheck,
  itemFromIncoming,
  itemFromResult,
  notificationItemId,
} from './notification-runtime.presentation';
import type { NotificationItem, RuntimeSource } from './notification-runtime.types';
import type { NotificationRuntimeStore } from './notification-runtime.store';

export type ReceiveNotificationItemArgs = {
  item: NotificationItem;
  source: RuntimeSource;
  userId?: string;
  transitionId?: string;
  causedByItemId?: string;
};

/**
 * Intentionally a no-op for Runtime collection authority.
 * Logs once per process in non-production for diagnostics.
 */
let warned = false;
function warnBlocked(path: string): void {
  if (warned) return;
  warned = true;
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      `[notifications-ingest] blocked ${path}: awaiting truthful Sync V1 (Phase 9)`,
    );
  }
}

export function receiveNotificationItem(
  _store: NotificationRuntimeStore,
  _args: ReceiveNotificationItemArgs,
): void {
  warnBlocked('receiveNotificationItem');
}

export function receiveNotificationItems(
  _store: NotificationRuntimeStore,
  _args: {
    items: NotificationItem[];
    source: RuntimeSource;
    userId?: string;
    transitionId?: string;
  },
): void {
  warnBlocked('receiveNotificationItems');
}

export function completeNotificationIdentity(
  _store: NotificationRuntimeStore,
  _args: {
    banId: string;
    kinds: Array<'incoming' | 'check'>;
    source: RuntimeSource;
    userId?: string;
  },
): void {
  warnBlocked('completeNotificationIdentity');
}

export function pendingIdForItem(item: NotificationItem): string {
  return notificationItemId(item);
}

export {
  itemFromIncoming,
  itemFromCheck,
  itemFromResult,
  notificationItemId,
};

export type { BanInteraction, BanResult, NotificationItem };
