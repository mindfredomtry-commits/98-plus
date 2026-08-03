/**
 * Stage 8 correction — presentation helpers only (no sequence/revision).
 */
import type { BanInteraction, BanResult } from '@98plus/shared';
import {
  notificationItemId,
  type NotificationItem,
} from './notification-runtime.types';

export function itemFromIncoming(ban: BanInteraction): NotificationItem {
  return { kind: 'incoming', ban };
}

export function itemFromCheck(ban: BanInteraction): NotificationItem {
  return { kind: 'check', ban };
}

export function itemFromResult(result: BanResult): NotificationItem {
  return { kind: 'result', result };
}

export { notificationItemId };
