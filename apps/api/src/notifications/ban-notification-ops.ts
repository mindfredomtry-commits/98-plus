/**
 * Lifecycle operation builders for Ban → Notification Journal.
 * Pure op construction; callers append inside a transaction.
 */
import type { NotificationPartyPublicV1 } from '@98plus/shared';
import type { AppendOperationInput } from './notifications-contract-v1.schema';
import {
  buildBanResultNotificationItemV1,
  buildCheckRequestNotificationItemV1,
  buildIncomingBanNotificationItemV1,
  checkItemId,
  incomingItemId,
  partyPublicFromUser,
  removeItemOp,
  resultItemId,
  upsertItemOp,
} from './notification-item-builders';

export type BanPartyUsers = {
  id: string;
  text: string;
  senderId: string;
  receiverId: string;
  durationMinutes: number;
  createdAt: Date | string;
  checkDueAt?: Date | string | null;
  completedAt?: Date | string | null;
  outcome?: string | null;
  sender: NotificationPartyPublicV1;
  receiver: NotificationPartyPublicV1;
};

export function banPartyFromUsers(input: {
  id: string;
  text: string;
  senderId: string;
  receiverId: string;
  durationMinutes: number;
  createdAt: Date | string;
  checkDueAt?: Date | string | null;
  completedAt?: Date | string | null;
  outcome?: string | null;
  sender: {
    id: string;
    username?: string | null;
    firstName?: string | null;
    photoUrl?: string | null;
  };
  receiver: {
    id: string;
    username?: string | null;
    firstName?: string | null;
    photoUrl?: string | null;
  };
}): BanPartyUsers {
  return {
    ...input,
    sender: partyPublicFromUser(input.sender),
    receiver: partyPublicFromUser(input.receiver),
  };
}

export function opsUpsertIncomingForReceiver(
  ban: BanPartyUsers,
): AppendOperationInput[] {
  return [
    upsertItemOp(
      buildIncomingBanNotificationItemV1({
        userId: ban.receiverId,
        banId: ban.id,
        text: ban.text,
        durationMinutes: ban.durationMinutes,
        senderId: ban.senderId,
        receiverId: ban.receiverId,
        createdAt: ban.createdAt,
        sender: ban.sender,
        receiver: ban.receiver,
      }),
    ),
  ];
}

export function opsRemoveIncomingForReceiver(
  banId: string,
  receiverId: string,
): AppendOperationInput[] {
  return [removeItemOp(receiverId, incomingItemId(banId))];
}

export function opsUpsertCheckForBoth(ban: BanPartyUsers): AppendOperationInput[] {
  const base = {
    banId: ban.id,
    text: ban.text,
    durationMinutes: ban.durationMinutes,
    checkDueAt: ban.checkDueAt ?? null,
    senderId: ban.senderId,
    receiverId: ban.receiverId,
    createdAt: ban.createdAt,
    sender: ban.sender,
    receiver: ban.receiver,
  };
  return [
    upsertItemOp(
      buildCheckRequestNotificationItemV1({
        ...base,
        userId: ban.senderId,
      }),
    ),
    upsertItemOp(
      buildCheckRequestNotificationItemV1({
        ...base,
        userId: ban.receiverId,
      }),
    ),
  ];
}

export function opsRemoveCheckForUser(
  banId: string,
  userId: string,
): AppendOperationInput[] {
  return [removeItemOp(userId, checkItemId(banId))];
}

export function opsOverboardResult(
  ban: BanPartyUsers & { completedAt: Date | string },
): AppendOperationInput[] {
  const completedAt = ban.completedAt;
  const outcome = ban.outcome ?? 'overboard';
  return [
    removeItemOp(ban.receiverId, incomingItemId(ban.id)),
    upsertItemOp(
      buildBanResultNotificationItemV1({
        userId: ban.receiverId,
        banId: ban.id,
        outcome,
        text: ban.text,
        completedAt,
        senderId: ban.senderId,
        receiverId: ban.receiverId,
        sender: ban.sender,
        receiver: ban.receiver,
        deliveryPolicy: 'NEXT_IN_SESSION',
        causedByItemId: incomingItemId(ban.id),
      }),
    ),
    upsertItemOp(
      buildBanResultNotificationItemV1({
        userId: ban.senderId,
        banId: ban.id,
        outcome,
        text: ban.text,
        completedAt,
        senderId: ban.senderId,
        receiverId: ban.receiverId,
        sender: ban.sender,
        receiver: ban.receiver,
        deliveryPolicy: 'FIFO',
        causedByItemId: null,
      }),
    ),
  ];
}

/** First check answer: remove check for answerer only. */
export function opsFirstCheckAnswer(
  banId: string,
  answererId: string,
): AppendOperationInput[] {
  return opsRemoveCheckForUser(banId, answererId);
}

/**
 * Second check answer / completion:
 * REMOVE check for answerer; UPSERT result for both.
 */
export function opsCheckCompletion(input: {
  ban: BanPartyUsers & { completedAt: Date | string; outcome: string };
  answererId: string;
}): AppendOperationInput[] {
  const { ban, answererId } = input;
  const otherId =
    answererId === ban.senderId ? ban.receiverId : ban.senderId;
  const completedAt = ban.completedAt;
  return [
    removeItemOp(answererId, checkItemId(ban.id)),
    removeItemOp(otherId, checkItemId(ban.id)),
    upsertItemOp(
      buildBanResultNotificationItemV1({
        userId: answererId,
        banId: ban.id,
        outcome: ban.outcome,
        text: ban.text,
        completedAt,
        senderId: ban.senderId,
        receiverId: ban.receiverId,
        sender: ban.sender,
        receiver: ban.receiver,
        deliveryPolicy: 'NEXT_IN_SESSION',
        causedByItemId: checkItemId(ban.id),
      }),
    ),
    upsertItemOp(
      buildBanResultNotificationItemV1({
        userId: otherId,
        banId: ban.id,
        outcome: ban.outcome,
        text: ban.text,
        completedAt,
        senderId: ban.senderId,
        receiverId: ban.receiverId,
        sender: ban.sender,
        receiver: ban.receiver,
        deliveryPolicy: 'FIFO',
        causedByItemId: null,
      }),
    ),
  ];
}

export function opsRemoveResultForUser(
  banId: string,
  userId: string,
): AppendOperationInput[] {
  return [removeItemOp(userId, resultItemId(banId))];
}

export { incomingItemId, checkItemId, resultItemId, partyPublicFromUser };
