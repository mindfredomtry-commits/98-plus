/**
 * Zod runtime validation for Notifications API Contract V1.
 * Types live in @98plus/shared; schemas live here (api has zod).
 */
import { z } from 'zod';
import {
  assertDeliveryPolicyV1,
  notificationItemIdV1,
  type NotificationItemKindV1,
  type NotificationItemV1,
  type NotificationOperationV1,
  type NotificationsSyncResponseV1,
} from '@98plus/shared';

const kindSchema = z.enum(['INCOMING_BAN', 'CHECK_REQUEST', 'BAN_RESULT']);
const deliveryPolicySchema = z.enum(['FIFO', 'NEXT_IN_SESSION']);

const partyPublicSchema = z.object({
  id: z.string().min(1),
  username: z.string().nullable(),
  firstName: z.string().nullable(),
  photoUrl: z.string().nullable(),
});

const incomingPayloadSchema = z.object({
  kind: z.literal('INCOMING_BAN'),
  banId: z.string().min(1),
  text: z.string(),
  durationMinutes: z.number().int(),
  senderId: z.string().min(1),
  receiverId: z.string().min(1),
  createdAt: z.string().min(1),
  sender: partyPublicSchema,
  receiver: partyPublicSchema,
});

const checkPayloadSchema = z.object({
  kind: z.literal('CHECK_REQUEST'),
  banId: z.string().min(1),
  text: z.string(),
  durationMinutes: z.number().int(),
  checkDueAt: z.string().nullable(),
  senderId: z.string().min(1),
  receiverId: z.string().min(1),
  createdAt: z.string().min(1),
  sender: partyPublicSchema,
  receiver: partyPublicSchema,
});

const resultPayloadSchema = z.object({
  kind: z.literal('BAN_RESULT'),
  banId: z.string().min(1),
  outcome: z.string().min(1),
  text: z.string(),
  completedAt: z.string().min(1),
  senderId: z.string().min(1),
  receiverId: z.string().min(1),
  headline: z.string(),
  subline: z.string(),
  sender: partyPublicSchema,
  receiver: partyPublicSchema,
});

export const notificationItemPayloadV1Schema = z.discriminatedUnion('kind', [
  incomingPayloadSchema,
  checkPayloadSchema,
  resultPayloadSchema,
]);

export const notificationItemV1ObjectSchema = z.object({
  itemId: z.string().min(1),
  userId: z.string().min(1),
  kind: kindSchema,
  banId: z.string().min(1),
  sequence: z.string().regex(/^\d+$/),
  createdAt: z.string().min(1),
  deliveryPolicy: deliveryPolicySchema,
  causedByItemId: z.string().min(1).nullable(),
  payload: notificationItemPayloadV1Schema,
});

export const notificationItemV1Schema = notificationItemV1ObjectSchema.superRefine(
  (item, ctx) => {
    try {
      assertDeliveryPolicyV1({
        deliveryPolicy: item.deliveryPolicy,
        causedByItemId: item.causedByItemId,
      });
    } catch (e) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: (e as Error).message,
        path: ['causedByItemId'],
      });
    }
    const expected = notificationItemIdV1(
      item.kind as NotificationItemKindV1,
      item.banId,
    );
    if (item.itemId !== expected) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `itemId must be ${expected}`,
        path: ['itemId'],
      });
    }
    if (item.payload.kind !== item.kind) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'payload.kind must match item.kind',
        path: ['payload', 'kind'],
      });
    }
    if (item.payload.banId !== item.banId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'payload.banId must match item.banId',
        path: ['payload', 'banId'],
      });
    }
  },
);

export const notificationOperationV1Schema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('UPSERT_ITEM'),
    revision: z.string().regex(/^\d+$/),
    item: notificationItemV1ObjectSchema,
  }),
  z.object({
    type: z.literal('REMOVE_ITEM'),
    revision: z.string().regex(/^\d+$/),
    itemId: z.string().min(1),
  }),
]);

export const notificationsSnapshotV1Schema = z.object({
  type: z.literal('SNAPSHOT'),
  revision: z.string().regex(/^\d+$/),
  items: z.array(notificationItemV1ObjectSchema),
});

export const notificationsDeltaV1Schema = z.object({
  type: z.literal('DELTA'),
  fromRevision: z.string().regex(/^\d+$/),
  revision: z.string().regex(/^\d+$/),
  operations: z.array(notificationOperationV1Schema),
});

export const notificationsSyncResponseV1Schema = z.discriminatedUnion('type', [
  notificationsSnapshotV1Schema,
  notificationsDeltaV1Schema,
]);

/** Input op before server assigns revision/sequence (journal append). */
export const appendUpsertInputSchema = z.object({
  type: z.literal('UPSERT_ITEM'),
  item: notificationItemV1ObjectSchema.omit({ sequence: true }),
});

export const appendRemoveInputSchema = z.object({
  type: z.literal('REMOVE_ITEM'),
  itemId: z.string().min(1),
  userId: z.string().min(1),
});

export const appendOperationInputSchema = z.discriminatedUnion('type', [
  appendUpsertInputSchema,
  appendRemoveInputSchema,
]);

export type AppendOperationInput = z.infer<typeof appendOperationInputSchema>;

export function parseNotificationsSyncResponseV1(
  value: unknown,
): NotificationsSyncResponseV1 {
  const parsed = notificationsSyncResponseV1Schema.parse(value);
  if (parsed.type === 'SNAPSHOT') {
    for (const item of parsed.items) {
      notificationItemV1Schema.parse(item);
    }
  } else {
    for (const op of parsed.operations) {
      if (op.type === 'UPSERT_ITEM') {
        notificationItemV1Schema.parse(op.item);
      }
    }
  }
  return parsed as NotificationsSyncResponseV1;
}

export function parseNotificationItemV1(value: unknown): NotificationItemV1 {
  return notificationItemV1Schema.parse(value) as NotificationItemV1;
}

export function parseNotificationOperationV1(
  value: unknown,
): NotificationOperationV1 {
  return notificationOperationV1Schema.parse(value) as NotificationOperationV1;
}
