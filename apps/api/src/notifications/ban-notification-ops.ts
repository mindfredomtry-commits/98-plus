/**
 * Lifecycle operation builders for Ban → Notification Journal.
 * Pure op construction; callers append inside a transaction.
 */
import type { AppendOperationInput } from './notifications-contract-v1.schema';
import {
  buildBanResultNotificationItemV1,
  buildCheckRequestNotificationItemV1,
  buildIncomingBanNotificationItemV1,
  checkItemId,
  incomingItemId,
  removeItemOp,
  resultItemId,
  upsertItemOp,
} from './notification-item-builders';

type BanParty = {
  id: string;
  text: string;
  senderId: string;
  receiverId: string;
  durationMinutes: number;
  createdAt: Date | string;
  checkDueAt?: Date | string | null;
  completedAt?: Date | string | null;
  outcome?: string | null;
};

export function opsUpsertIncomingForReceiver(ban: BanParty): AppendOperationInput[] {
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

export function opsUpsertCheckForBoth(ban: BanParty): AppendOperationInput[] {
  const base = {
    banId: ban.id,
    text: ban.text,
    checkDueAt: ban.checkDueAt ?? null,
    senderId: ban.senderId,
    receiverId: ban.receiverId,
    createdAt: ban.createdAt,
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

export function opsOverboardResult(ban: BanParty & { completedAt: Date | string }): AppendOperationInput[] {
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
  ban: BanParty & { completedAt: Date | string; outcome: string };
  answererId: string;
}): AppendOperationInput[] {
  const { ban, answererId } = input;
  const otherId =
    answererId === ban.senderId ? ban.receiverId : ban.senderId;
  const completedAt = ban.completedAt;
  return [
    removeItemOp(answererId, checkItemId(ban.id)),
    // Partner may still have check — remove for both to clear
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
        deliveryPolicy: 'FIFO',
        causedByItemId: null,
      }),
    ),
  ];
}

export function opsTimeoutResult(
  ban: BanParty & { completedAt: Date | string },
): AppendOperationInput[] {
  const completedAt = ban.completedAt;
  const outcome = ban.outcome ?? 'timeout';
  return [
    removeItemOp(ban.senderId, checkItemId(ban.id)),
    removeItemOp(ban.receiverId, checkItemId(ban.id)),
    upsertItemOp(
      buildBanResultNotificationItemV1({
        userId: ban.senderId,
        banId: ban.id,
        outcome,
        text: ban.text,
        completedAt,
        senderId: ban.senderId,
        receiverId: ban.receiverId,
        deliveryPolicy: 'FIFO',
        causedByItemId: null,
      }),
    ),
    upsertItemOp(
      buildBanResultNotificationItemV1({
        userId: ban.receiverId,
        banId: ban.id,
        outcome,
        text: ban.text,
        completedAt,
        senderId: ban.senderId,
        receiverId: ban.receiverId,
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

export { incomingItemId, checkItemId, resultItemId };
