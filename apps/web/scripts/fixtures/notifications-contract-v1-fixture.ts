/**
 * TEST FIXTURE ONLY — Notifications Contract V1 builders for unit/composition tests.
 *
 * NOT production. Must not be imported from apps/web/src.
 * Sequence and revision are explicit test inputs — never derived from timestamps.
 */
import {
  notificationItemIdV1,
  type NotificationItemV1,
  type NotificationOperationV1,
  type NotificationPartyPublicV1,
  type NotificationsDeltaV1,
  type NotificationsSnapshotV1,
} from '@98plus/shared';
import type { BanInteraction, BanResult } from '@98plus/shared';
import type { NotificationItem } from '../../src/notification-runtime/notification-runtime.types';

const SENDER: NotificationPartyPublicV1 = {
  id: 'sender',
  username: 'sender',
  firstName: 'S',
  photoUrl: 'https://cdn.example/s.jpg',
};

function receiverParty(userId: string): NotificationPartyPublicV1 {
  return {
    id: userId,
    username: 'recv',
    firstName: 'R',
    photoUrl: 'https://cdn.example/r.jpg',
  };
}

export function fixtureItemFromIncoming(ban: BanInteraction): NotificationItem {
  return { kind: 'incoming', ban };
}

export function fixtureItemFromCheck(ban: BanInteraction): NotificationItem {
  return { kind: 'check', ban };
}

export function fixtureItemFromResult(result: BanResult): NotificationItem {
  return { kind: 'result', result };
}

export function fixtureContractIncoming(input: {
  banId: string;
  userId: string;
  sequence: string;
  text?: string;
  createdAt?: string;
}): NotificationItemV1 {
  const createdAt = input.createdAt ?? '2026-01-01T10:00:00.000Z';
  const receiver = receiverParty(input.userId);
  return {
    itemId: notificationItemIdV1('INCOMING_BAN', input.banId),
    userId: input.userId,
    kind: 'INCOMING_BAN',
    banId: input.banId,
    sequence: input.sequence,
    createdAt,
    deliveryPolicy: 'FIFO',
    causedByItemId: null,
    payload: {
      kind: 'INCOMING_BAN',
      banId: input.banId,
      text: input.text ?? `ban ${input.banId}`,
      durationMinutes: 30,
      senderId: SENDER.id,
      receiverId: input.userId,
      createdAt,
      sender: SENDER,
      receiver,
    },
  };
}

export function fixtureContractCheck(input: {
  banId: string;
  userId: string;
  sequence: string;
}): NotificationItemV1 {
  const receiver = receiverParty(input.userId);
  return {
    itemId: notificationItemIdV1('CHECK_REQUEST', input.banId),
    userId: input.userId,
    kind: 'CHECK_REQUEST',
    banId: input.banId,
    sequence: input.sequence,
    createdAt: '2026-01-01T10:02:00.000Z',
    deliveryPolicy: 'FIFO',
    causedByItemId: null,
    payload: {
      kind: 'CHECK_REQUEST',
      banId: input.banId,
      text: 'check',
      durationMinutes: 30,
      checkDueAt: null,
      senderId: SENDER.id,
      receiverId: input.userId,
      createdAt: '2026-01-01T10:02:00.000Z',
      sender: SENDER,
      receiver,
    },
  };
}

export function fixtureContractResult(input: {
  banId: string;
  userId: string;
  sequence: string;
  deliveryPolicy?: 'FIFO' | 'NEXT_IN_SESSION';
  causedByItemId?: string | null;
  outcome?: string;
}): NotificationItemV1 {
  const receiver = receiverParty(input.userId);
  const outcome = input.outcome ?? 'overboard';
  return {
    itemId: notificationItemIdV1('BAN_RESULT', input.banId),
    userId: input.userId,
    kind: 'BAN_RESULT',
    banId: input.banId,
    sequence: input.sequence,
    createdAt: '2026-01-01T12:00:00.000Z',
    deliveryPolicy: input.deliveryPolicy ?? 'FIFO',
    causedByItemId: input.causedByItemId ?? null,
    payload: {
      kind: 'BAN_RESULT',
      banId: input.banId,
      outcome,
      text: 'result',
      completedAt: '2026-01-01T12:00:00.000Z',
      senderId: SENDER.id,
      receiverId: input.userId,
      headline: 'ПЕРЕБОР',
      subline: '−8 ⚡ обоим.',
      sender: SENDER,
      receiver,
    },
  };
}

export function fixtureSnapshot(input: {
  revision: string;
  items: NotificationItemV1[];
}): NotificationsSnapshotV1 {
  return {
    type: 'SNAPSHOT',
    revision: input.revision,
    items: input.items,
  };
}

export function fixtureDelta(input: {
  fromRevision: string;
  revision: string;
  operations: NotificationOperationV1[];
}): NotificationsDeltaV1 {
  return {
    type: 'DELTA',
    fromRevision: input.fromRevision,
    revision: input.revision,
    operations: input.operations,
  };
}

export function fixtureRemoveThenUpsertDelta(input: {
  fromRevision: string;
  removeItemId: string;
  removeRevision: string;
  upsert?: NotificationItemV1;
  upsertRevision?: string;
}): NotificationsDeltaV1 {
  const ops: NotificationOperationV1[] = [
    {
      type: 'REMOVE_ITEM',
      revision: input.removeRevision,
      itemId: input.removeItemId,
    },
  ];
  let revision = input.removeRevision;
  if (input.upsert && input.upsertRevision) {
    ops.push({
      type: 'UPSERT_ITEM',
      revision: input.upsertRevision,
      item: input.upsert,
    });
    revision = input.upsertRevision;
  }
  return {
    type: 'DELTA',
    fromRevision: input.fromRevision,
    revision,
    operations: ops,
  };
}

/** Presentation stub paired with a Contract V1 incoming item (tests only). */
export function fixturePresentationIncoming(
  banId: string,
  userId: string,
): NotificationItem {
  return fixtureItemFromIncoming({
    id: banId,
    text: `ban-${banId}`,
    status: 'PENDING',
    durationMinutes: 30,
    sender: {
      id: 'sender',
      telegramId: '1',
      username: 'sender',
      firstName: 'S',
      lastName: null,
      avatarUrl: 'https://cdn.example/s.jpg',
      photoUrl: 'https://cdn.example/s.jpg',
      aura: 'stable',
      auraLabel: '',
      energyPercent: 50,
      streak: 0,
      isOnboarded: true,
      notificationMode: 'all',
    },
    receiver: {
      id: userId,
      telegramId: '2',
      username: 'recv',
      firstName: 'R',
      lastName: null,
      avatarUrl: 'https://cdn.example/r.jpg',
      photoUrl: 'https://cdn.example/r.jpg',
      aura: 'stable',
      auraLabel: '',
      energyPercent: 50,
      streak: 0,
      isOnboarded: true,
      notificationMode: 'all',
    },
    isIncoming: true,
    createdAt: '2026-01-01T10:00:00.000Z',
    expiresAt: null,
    checkDueAt: null,
    threadId: 't',
  });
}

export function fixturePresentationResult(
  banId: string,
  userId: string,
): NotificationItem {
  const incoming = fixturePresentationIncoming(banId, userId);
  if (incoming.kind !== 'incoming') throw new Error('unreachable');
  return fixtureItemFromResult({
    id: banId,
    text: 'result',
    outcome: 'overboard',
    headline: 'ПЕРЕБОР',
    subline: '−8 ⚡ обоим.',
    completedAt: '2026-01-01T12:00:00.000Z',
    sender: incoming.ban.sender,
    receiver: incoming.ban.receiver,
    viewerId: userId,
    opponent: incoming.ban.sender,
    confirmations: null,
    energy: { sender: 0, receiver: 0 },
    farmSkipped: false,
    deepLink: '',
    shareLink: '',
    inviteOpponentLink: '',
  });
}
