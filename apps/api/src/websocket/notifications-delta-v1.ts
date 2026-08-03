/**
 * WebSocket publication boundary for notifications:delta:v1.
 *
 * Does not replace existing ban:incoming / check:* / sync:session broadcasts.
 * Call only after a committed transaction — never inside an open tx.
 */
import {
  NOTIFICATIONS_DELTA_V1_EVENT,
  type NotificationsDeltaV1,
  type NotificationOperationV1,
} from '@98plus/shared';
import { notificationsDeltaV1Schema } from '../notifications/notifications-contract-v1.schema';
import { broadcastToUser } from './hub';

export type NotificationsDeltaPublishResult =
  | { published: true; event: typeof NOTIFICATIONS_DELTA_V1_EVENT }
  | { published: false; reason: string };

/**
 * Publish a Contract V1 delta to one user over the existing WS hub.
 * Safe to call from multiple API instances (hub redis fan-out).
 */
export function publishNotificationsDeltaV1(input: {
  userId: string;
  fromRevision: string;
  revision: string;
  operations: NotificationOperationV1[];
}): NotificationsDeltaPublishResult {
  if (!input.userId.trim()) {
    return { published: false, reason: 'missing-userId' };
  }
  if (input.operations.length === 0) {
    return { published: false, reason: 'empty-operations' };
  }

  const payload: NotificationsDeltaV1 = {
    type: 'DELTA',
    fromRevision: input.fromRevision,
    revision: input.revision,
    operations: input.operations,
  };

  const parsed = notificationsDeltaV1Schema.safeParse(payload);
  if (!parsed.success) {
    return { published: false, reason: 'invalid-delta-payload' };
  }

  broadcastToUser(input.userId, {
    type: NOTIFICATIONS_DELTA_V1_EVENT,
    payload: parsed.data,
  });

  return { published: true, event: NOTIFICATIONS_DELTA_V1_EVENT };
}
