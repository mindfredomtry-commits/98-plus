/**
 * Authoritative Contract V1 notification item builders.
 * Sequence is assigned by the journal on append — builders omit it.
 */
import {
  notificationItemIdV1,
  type NotificationDeliveryPolicyV1,
  type NotificationItemV1,
} from '@98plus/shared';
import {
  appendOperationInputSchema,
  notificationItemV1ObjectSchema,
  type AppendOperationInput,
} from './notifications-contract-v1.schema';

export type NotificationItemV1WithoutSequence = Omit<
  NotificationItemV1,
  'sequence'
>;

function validateItemWithoutSequence(
  item: NotificationItemV1WithoutSequence,
): NotificationItemV1WithoutSequence {
  // sequence is server-owned; validate with a placeholder for Zod shape.
  const parsed = notificationItemV1ObjectSchema.parse({
    ...item,
    sequence: '0',
  });
  const { sequence: _seq, ...rest } = parsed;
  void _seq;
  return rest;
}

export function buildIncomingBanNotificationItemV1(input: {
  userId: string;
  banId: string;
  text: string;
  durationMinutes: number;
  senderId: string;
  receiverId: string;
  createdAt: string | Date;
  deliveryPolicy?: NotificationDeliveryPolicyV1;
  causedByItemId?: string | null;
}): NotificationItemV1WithoutSequence {
  const createdAt =
    typeof input.createdAt === 'string'
      ? input.createdAt
      : input.createdAt.toISOString();
  return validateItemWithoutSequence({
    itemId: notificationItemIdV1('INCOMING_BAN', input.banId),
    userId: input.userId,
    kind: 'INCOMING_BAN',
    banId: input.banId,
    createdAt,
    deliveryPolicy: input.deliveryPolicy ?? 'FIFO',
    causedByItemId: input.causedByItemId ?? null,
    payload: {
      kind: 'INCOMING_BAN',
      banId: input.banId,
      text: input.text,
      durationMinutes: input.durationMinutes,
      senderId: input.senderId,
      receiverId: input.receiverId,
      createdAt,
    },
  });
}

export function buildCheckRequestNotificationItemV1(input: {
  userId: string;
  banId: string;
  text: string;
  checkDueAt: string | Date | null;
  senderId: string;
  receiverId: string;
  createdAt: string | Date;
  deliveryPolicy?: NotificationDeliveryPolicyV1;
  causedByItemId?: string | null;
}): NotificationItemV1WithoutSequence {
  const createdAt =
    typeof input.createdAt === 'string'
      ? input.createdAt
      : input.createdAt.toISOString();
  const checkDueAt =
    input.checkDueAt == null
      ? null
      : typeof input.checkDueAt === 'string'
        ? input.checkDueAt
        : input.checkDueAt.toISOString();
  return validateItemWithoutSequence({
    itemId: notificationItemIdV1('CHECK_REQUEST', input.banId),
    userId: input.userId,
    kind: 'CHECK_REQUEST',
    banId: input.banId,
    createdAt,
    deliveryPolicy: input.deliveryPolicy ?? 'FIFO',
    causedByItemId: input.causedByItemId ?? null,
    payload: {
      kind: 'CHECK_REQUEST',
      banId: input.banId,
      text: input.text,
      checkDueAt,
      senderId: input.senderId,
      receiverId: input.receiverId,
      createdAt,
    },
  });
}

export function buildBanResultNotificationItemV1(input: {
  userId: string;
  banId: string;
  outcome: string;
  text: string;
  completedAt: string | Date;
  senderId: string;
  receiverId: string;
  createdAt?: string | Date;
  deliveryPolicy: NotificationDeliveryPolicyV1;
  causedByItemId: string | null;
}): NotificationItemV1WithoutSequence {
  const completedAt =
    typeof input.completedAt === 'string'
      ? input.completedAt
      : input.completedAt.toISOString();
  const createdAt =
    input.createdAt == null
      ? completedAt
      : typeof input.createdAt === 'string'
        ? input.createdAt
        : input.createdAt.toISOString();
  return validateItemWithoutSequence({
    itemId: notificationItemIdV1('BAN_RESULT', input.banId),
    userId: input.userId,
    kind: 'BAN_RESULT',
    banId: input.banId,
    createdAt,
    deliveryPolicy: input.deliveryPolicy,
    causedByItemId: input.causedByItemId,
    payload: {
      kind: 'BAN_RESULT',
      banId: input.banId,
      outcome: input.outcome,
      text: input.text,
      completedAt,
      senderId: input.senderId,
      receiverId: input.receiverId,
    },
  });
}

export function upsertItemOp(
  item: NotificationItemV1WithoutSequence,
): AppendOperationInput {
  return appendOperationInputSchema.parse({
    type: 'UPSERT_ITEM',
    item,
  });
}

export function removeItemOp(
  userId: string,
  itemId: string,
): AppendOperationInput {
  return appendOperationInputSchema.parse({
    type: 'REMOVE_ITEM',
    userId,
    itemId,
  });
}

export function incomingItemId(banId: string): string {
  return notificationItemIdV1('INCOMING_BAN', banId);
}

export function checkItemId(banId: string): string {
  return notificationItemIdV1('CHECK_REQUEST', banId);
}

export function resultItemId(banId: string): string {
  return notificationItemIdV1('BAN_RESULT', banId);
}
