/**
 * Canonical FIFO authority for Notification Runtime queue.
 *
 * Backend contracts:
 * - GET /bans/incoming/pending-all → createdAt DESC (newest-first)
 * - session.incoming → newest single pending candidate
 *
 * Runtime normalizes every merge to oldest-first by immutable createdAt
 * (ban) / completedAt (result), with stable item id as tie-breaker.
 * Client receive time and source path are not ordering authority.
 */
import {
  notificationItemId,
  type NotificationItem,
} from './notification-runtime.types';

/** Milliseconds used for FIFO compare; missing/invalid timestamps sort as 0. */
export function notificationItemOrderTimeMs(item: NotificationItem): number {
  if (item.kind === 'result') {
    const parsed = Date.parse(item.result.completedAt);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const parsed = Date.parse(item.ban.createdAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Oldest-first. Equal timestamps → lexicographic notificationItemId.
 * Deterministic; no Date.now / receive-time / source priority.
 */
export function compareNotificationFifoOrder(
  a: NotificationItem,
  b: NotificationItem,
): number {
  const timeDelta =
    notificationItemOrderTimeMs(a) - notificationItemOrderTimeMs(b);
  if (timeDelta !== 0) return timeDelta;
  const idA = notificationItemId(a);
  const idB = notificationItemId(b);
  if (idA < idB) return -1;
  if (idA > idB) return 1;
  return 0;
}

/** Return a new array sorted into canonical FIFO order. */
export function sortNotificationQueueFifo(
  items: readonly NotificationItem[],
): NotificationItem[] {
  return [...items].sort(compareNotificationFifoOrder);
}
