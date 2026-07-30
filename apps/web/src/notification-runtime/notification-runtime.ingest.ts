/**
 * Phase 0 — direct ingestion into NotificationRuntime (no legacy queues).
 */
import { enrichBanInteraction } from '@/lib/user-public-avatar';
import type { BanInteraction, BanResult } from '@98plus/shared';
import {
  nextRuntimeTransitionId,
  notificationItemId,
  type NotificationRuntimeStore,
} from './notification-runtime.store';
import {
  mergePendingItemIds,
  pendingItemIdFromParts,
} from './notification-runtime.pending';
import type {
  NotificationItem,
  RuntimeSource,
} from './notification-runtime.types';

export type ReceiveNotificationItemArgs = {
  item: NotificationItem;
  source: RuntimeSource;
  /** When true, replace entire queue (bootstrap-style). Default merge/append. */
  replaceQueue?: boolean;
  /** Also merge into pending identities. Default true. */
  mergePending?: boolean;
};

/**
 * Sole Direct Host ingestion entry. Writes only via runtime dispatch.
 */
export function receiveNotificationItem(
  store: NotificationRuntimeStore,
  args: ReceiveNotificationItemArgs,
): { accepted: boolean; itemId: string } {
  const item = normalizeItem(args.item);
  const itemId = notificationItemId(item);
  const transitionId = nextRuntimeTransitionId(`ingest:${args.source}`);
  store.dispatch({
    type: 'ITEMS_RECEIVED',
    transitionId,
    items: [item],
    replaceQueue: Boolean(args.replaceQueue),
    source: args.source,
  });
  if (args.mergePending !== false) {
    mergePendingItemIds(store, [itemId], args.source);
  }
  return { accepted: true, itemId };
}

export function receiveNotificationItems(
  store: NotificationRuntimeStore,
  args: {
    items: readonly NotificationItem[];
    source: RuntimeSource;
    replaceQueue?: boolean;
    mergePending?: boolean;
  },
): void {
  const items = args.items.map(normalizeItem);
  if (items.length === 0 && !args.replaceQueue) return;
  const transitionId = nextRuntimeTransitionId(`ingest-batch:${args.source}`);
  store.dispatch({
    type: 'ITEMS_RECEIVED',
    transitionId,
    items,
    replaceQueue: Boolean(args.replaceQueue),
    source: args.source,
  });
  if (args.mergePending !== false && items.length > 0) {
    mergePendingItemIds(
      store,
      items.map(notificationItemId),
      args.source,
    );
  }
}

export function completeNotificationIdentity(
  store: NotificationRuntimeStore,
  itemId: string,
  source: RuntimeSource = 'websocket',
): void {
  store.dispatch({
    type: 'ITEM_COMPLETED',
    transitionId: nextRuntimeTransitionId('complete'),
    targetItemId: itemId,
    source,
  });
}

function normalizeItem(item: NotificationItem): NotificationItem {
  if (item.kind === 'result') return item;
  return {
    kind: item.kind,
    ban: enrichBanInteraction(item.ban),
  };
}

export function itemFromIncoming(ban: BanInteraction): NotificationItem {
  return { kind: 'incoming', ban: enrichBanInteraction(ban) };
}

export function itemFromCheck(ban: BanInteraction): NotificationItem {
  return { kind: 'check', ban: enrichBanInteraction(ban) };
}

export function itemFromResult(result: BanResult): NotificationItem {
  return { kind: 'result', result };
}

export function pendingIdForItem(item: NotificationItem): string | null {
  if (item.kind === 'result') {
    return pendingItemIdFromParts('result', item.result.id);
  }
  return pendingItemIdFromParts(item.kind, item.ban.id);
}
