/**
 * Notifications API Contract V1 — transport-neutral shared types.
 *
 * HTTP GET /notifications/sync and WS notifications:delta:v1 use these shapes.
 * Server owns sequence/revision; client receive time is not FIFO authority.
 *
 * Payload includes display identity required by Presenter/UI. Frontend must not
 * invent missing business/display fields or fetch users separately.
 */

export type NotificationItemKindV1 =
  | 'INCOMING_BAN'
  | 'CHECK_REQUEST'
  | 'BAN_RESULT';

export type NotificationDeliveryPolicyV1 = 'FIFO' | 'NEXT_IN_SESSION';

/** Minimal party identity for Notifications UI (names + avatar). */
export type NotificationPartyPublicV1 = {
  id: string;
  username: string | null;
  firstName: string | null;
  photoUrl: string | null;
};

export type NotificationIncomingBanPayloadV1 = {
  kind: 'INCOMING_BAN';
  banId: string;
  text: string;
  durationMinutes: number;
  senderId: string;
  receiverId: string;
  createdAt: string;
  sender: NotificationPartyPublicV1;
  receiver: NotificationPartyPublicV1;
};

export type NotificationCheckRequestPayloadV1 = {
  kind: 'CHECK_REQUEST';
  banId: string;
  text: string;
  durationMinutes: number;
  checkDueAt: string | null;
  senderId: string;
  receiverId: string;
  createdAt: string;
  sender: NotificationPartyPublicV1;
  receiver: NotificationPartyPublicV1;
};

export type NotificationBanResultPayloadV1 = {
  kind: 'BAN_RESULT';
  banId: string;
  outcome: string;
  text: string;
  completedAt: string;
  senderId: string;
  receiverId: string;
  /** Viewer-scoped presentation copy (built server-side for this userId). */
  headline: string;
  subline: string;
  sender: NotificationPartyPublicV1;
  receiver: NotificationPartyPublicV1;
};

export type NotificationItemPayloadV1 =
  | NotificationIncomingBanPayloadV1
  | NotificationCheckRequestPayloadV1
  | NotificationBanResultPayloadV1;

export type NotificationItemV1 = {
  itemId: string;
  userId: string;
  kind: NotificationItemKindV1;
  banId: string;
  /** Monotonic server sequence; JSON string of bigint. */
  sequence: string;
  createdAt: string;
  deliveryPolicy: NotificationDeliveryPolicyV1;
  causedByItemId: string | null;
  payload: NotificationItemPayloadV1;
};

export type NotificationOperationV1 =
  | {
      type: 'UPSERT_ITEM';
      revision: string;
      item: NotificationItemV1;
    }
  | {
      type: 'REMOVE_ITEM';
      revision: string;
      itemId: string;
    };

export type NotificationsSnapshotV1 = {
  type: 'SNAPSHOT';
  revision: string;
  items: NotificationItemV1[];
};

export type NotificationsDeltaV1 = {
  type: 'DELTA';
  fromRevision: string;
  revision: string;
  operations: NotificationOperationV1[];
};

export type NotificationsSyncResponseV1 =
  | NotificationsSnapshotV1
  | NotificationsDeltaV1;

/** WS event type — same payload as NotificationsDeltaV1. */
export const NOTIFICATIONS_DELTA_V1_EVENT = 'notifications:delta:v1' as const;

/**
 * Deterministic itemId formulas (immutable; no status/timestamp).
 *
 * - INCOMING_BAN → incoming:<banId>
 * - CHECK_REQUEST → check:<banId>
 *   Check is a phase of the same Ban row; banId is the stable identity.
 * - BAN_RESULT → result:<banId>
 *   Result is the terminal Ban projection; banId is the stable identity.
 */
export function notificationItemIdV1(
  kind: NotificationItemKindV1,
  banId: string,
): string {
  const id = String(banId ?? '').trim();
  if (!id) {
    throw new Error('notificationItemIdV1: banId required');
  }
  switch (kind) {
    case 'INCOMING_BAN':
      return `incoming:${id}`;
    case 'CHECK_REQUEST':
      return `check:${id}`;
    case 'BAN_RESULT':
      return `result:${id}`;
    default: {
      const _exhaustive: never = kind;
      void _exhaustive;
      throw new Error(`notificationItemIdV1: unknown kind`);
    }
  }
}

export function parseNotificationItemIdV1(
  itemId: string,
): { kind: NotificationItemKindV1; banId: string } | null {
  const raw = String(itemId ?? '').trim();
  const incoming = /^incoming:(.+)$/.exec(raw);
  if (incoming?.[1]) {
    return { kind: 'INCOMING_BAN', banId: incoming[1] };
  }
  const check = /^check:(.+)$/.exec(raw);
  if (check?.[1]) {
    return { kind: 'CHECK_REQUEST', banId: check[1] };
  }
  const result = /^result:(.+)$/.exec(raw);
  if (result?.[1]) {
    return { kind: 'BAN_RESULT', banId: result[1] };
  }
  return null;
}

export function assertDeliveryPolicyV1(input: {
  deliveryPolicy: NotificationDeliveryPolicyV1;
  causedByItemId: string | null;
}): void {
  if (input.deliveryPolicy === 'NEXT_IN_SESSION') {
    if (!input.causedByItemId?.trim()) {
      throw new Error(
        'NEXT_IN_SESSION requires causedByItemId (direct causal predecessor)',
      );
    }
  }
}
