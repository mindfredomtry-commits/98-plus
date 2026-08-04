/**
 * Authoritative Contract V1 notification item builders.
 * Sequence is assigned by the journal on append — builders omit it.
 */
import {
  buildResultPresentation,
  notificationItemIdV1,
  type InteractionOutcome,
  type NotificationDeliveryPolicyV1,
  type NotificationItemV1,
  type NotificationPartyPublicV1,
  type UserPublic,
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

export function partyPublicFromUser(
  user: Pick<UserPublic, 'id' | 'username' | 'firstName' | 'photoUrl' | 'avatarUrl'> | {
    id: string;
    username?: string | null;
    firstName?: string | null;
    photoUrl?: string | null;
  },
): NotificationPartyPublicV1 {
  const photo =
    'avatarUrl' in user && user.avatarUrl
      ? user.avatarUrl
      : (user.photoUrl ?? null);
  return {
    id: user.id,
    username: user.username ?? null,
    firstName: user.firstName ?? null,
    photoUrl: photo,
  };
}

function validateItemWithoutSequence(
  item: NotificationItemV1WithoutSequence,
): NotificationItemV1WithoutSequence {
  const parsed = notificationItemV1ObjectSchema.parse({
    ...item,
    sequence: '0',
  });
  const { sequence: _seq, ...rest } = parsed;
  void _seq;
  return rest as NotificationItemV1WithoutSequence;
}

export function buildIncomingBanNotificationItemV1(input: {
  userId: string;
  banId: string;
  text: string;
  durationMinutes: number;
  senderId: string;
  receiverId: string;
  createdAt: string | Date;
  sender: NotificationPartyPublicV1;
  receiver: NotificationPartyPublicV1;
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
      sender: input.sender,
      receiver: input.receiver,
    },
  });
}

export function buildCheckRequestNotificationItemV1(input: {
  userId: string;
  banId: string;
  text: string;
  durationMinutes: number;
  checkDueAt: string | Date | null;
  senderId: string;
  receiverId: string;
  createdAt: string | Date;
  sender: NotificationPartyPublicV1;
  receiver: NotificationPartyPublicV1;
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
      durationMinutes: input.durationMinutes,
      checkDueAt,
      senderId: input.senderId,
      receiverId: input.receiverId,
      createdAt,
      sender: input.sender,
      receiver: input.receiver,
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
  sender: NotificationPartyPublicV1;
  receiver: NotificationPartyPublicV1;
  createdAt?: string | Date;
  deliveryPolicy: NotificationDeliveryPolicyV1;
  causedByItemId: string | null;
  headline?: string;
  subline?: string;
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

  let headline = input.headline;
  let subline = input.subline;
  if (headline == null || subline == null) {
    const copy = buildResultPresentation(
      input.outcome as InteractionOutcome,
      input.userId,
      {
        id: input.sender.id,
        telegramId: '0',
        username: input.sender.username,
        firstName: input.sender.firstName ?? '',
        lastName: null,
        avatarUrl: input.sender.photoUrl,
        photoUrl: input.sender.photoUrl,
        aura: 'stable',
        auraLabel: '',
        energyPercent: 0,
        streak: 0,
        isOnboarded: true,
        notificationMode: 'real-time',
      },
      {
        id: input.receiver.id,
        telegramId: '0',
        username: input.receiver.username,
        firstName: input.receiver.firstName ?? '',
        lastName: null,
        avatarUrl: input.receiver.photoUrl,
        photoUrl: input.receiver.photoUrl,
        aura: 'stable',
        auraLabel: '',
        energyPercent: 0,
        streak: 0,
        isOnboarded: true,
        notificationMode: 'real-time',
      },
      null,
    );
    headline = headline ?? copy.headline;
    subline = subline ?? copy.subline;
  }

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
      headline: headline!,
      subline: subline!,
      sender: input.sender,
      receiver: input.receiver,
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
