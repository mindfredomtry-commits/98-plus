/**
 * Temporary production input adapter (Phase 8).
 *
 * Converts legacy BanInteraction / BanResult payloads into Contract V1 items
 * for APPLY_SNAPSHOT / APPLY_DELTA until Phase 9 Sync Journal / Mapper cutover.
 *
 * Sequence mapping (TEMPORARY — not journal authority):
 *   sequence = decimal string of createdAt/completedAt epoch ms
 *
 * Revision mapping (TEMPORARY):
 *   snapshot revision = max(item.sequence, priorRevision)
 *   delta revisions = monotonic max(prior+1, sequence)
 *
 * Production correctness still requires Phase 9 journal sequence/revision.
 */
import {
  notificationItemIdV1,
  type NotificationItemV1,
  type NotificationOperationV1,
  type NotificationsDeltaV1,
  type NotificationsSnapshotV1,
} from '@98plus/shared';
import type { BanInteraction, BanResult } from '@98plus/shared';
import type { NotificationItem } from './notification-runtime.types';

function epochMsSequence(iso: string | null | undefined): string {
  const parsed = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(parsed)) return '0';
  return String(Math.trunc(parsed));
}

function maxRevision(a: string | null, b: string): string {
  if (a == null) return b;
  try {
    return BigInt(a) >= BigInt(b) ? a : b;
  } catch {
    return b > a ? b : a;
  }
}

function bumpRevision(current: string | null, floor: string): string {
  const base = maxRevision(current, floor);
  try {
    return (BigInt(base) + BigInt(1)).toString();
  } catch {
    return `${base}+1`;
  }
}

export function itemFromIncoming(ban: BanInteraction): NotificationItem {
  return { kind: 'incoming', ban };
}

export function itemFromCheck(ban: BanInteraction): NotificationItem {
  return { kind: 'check', ban };
}

export function itemFromResult(result: BanResult): NotificationItem {
  return { kind: 'result', result };
}

export function toContractItemV1(
  item: NotificationItem,
  userId: string,
): NotificationItemV1 {
  if (item.kind === 'incoming') {
    const banId = String(item.ban.id);
    return {
      itemId: notificationItemIdV1('INCOMING_BAN', banId),
      userId,
      kind: 'INCOMING_BAN',
      banId,
      sequence: epochMsSequence(item.ban.createdAt),
      createdAt: item.ban.createdAt,
      deliveryPolicy: 'FIFO',
      causedByItemId: null,
      payload: {
        kind: 'INCOMING_BAN',
        banId,
        text: item.ban.text,
        durationMinutes: item.ban.durationMinutes,
        senderId: item.ban.sender.id,
        receiverId: item.ban.receiver.id,
        createdAt: item.ban.createdAt,
      },
    };
  }
  if (item.kind === 'check') {
    const banId = String(item.ban.id);
    return {
      itemId: notificationItemIdV1('CHECK_REQUEST', banId),
      userId,
      kind: 'CHECK_REQUEST',
      banId,
      sequence: epochMsSequence(item.ban.checkDueAt ?? item.ban.createdAt),
      createdAt: item.ban.createdAt,
      deliveryPolicy: 'FIFO',
      causedByItemId: null,
      payload: {
        kind: 'CHECK_REQUEST',
        banId,
        text: item.ban.text,
        checkDueAt: item.ban.checkDueAt,
        senderId: item.ban.sender.id,
        receiverId: item.ban.receiver.id,
        createdAt: item.ban.createdAt,
      },
    };
  }
  const banId = String(item.result.id);
  return {
    itemId: notificationItemIdV1('BAN_RESULT', banId),
    userId,
    kind: 'BAN_RESULT',
    banId,
    sequence: epochMsSequence(item.result.completedAt),
    createdAt: item.result.completedAt,
    deliveryPolicy: 'FIFO',
    causedByItemId: null,
    payload: {
      kind: 'BAN_RESULT',
      banId,
      outcome: String(item.result.outcome),
      text: item.result.text,
      completedAt: item.result.completedAt,
      senderId: item.result.sender.id,
      receiverId: item.result.receiver.id,
    },
  };
}

/** Causal NEXT_IN_SESSION result after overboard of causedByItemId. */
export function toCausalResultItemV1(
  result: BanResult,
  userId: string,
  causedByItemId: string,
): NotificationItemV1 {
  const base = toContractItemV1(itemFromResult(result), userId);
  return {
    ...base,
    deliveryPolicy: 'NEXT_IN_SESSION',
    causedByItemId,
  };
}

export function buildSnapshotFromLegacyItems(input: {
  items: NotificationItem[];
  userId: string;
  priorRevision: string | null;
}): {
  snapshot: NotificationsSnapshotV1;
  presentationByItemId: Record<string, NotificationItem>;
} {
  const presentationByItemId: Record<string, NotificationItem> = {};
  const byId = new Map<string, NotificationItemV1>();
  let rev = input.priorRevision ?? '0';
  for (const item of input.items) {
    const v1 = toContractItemV1(item, input.userId);
    byId.set(v1.itemId, v1);
    presentationByItemId[v1.itemId] = item;
    rev = maxRevision(rev, v1.sequence);
  }
  return {
    snapshot: {
      type: 'SNAPSHOT',
      revision: rev,
      items: [...byId.values()],
    },
    presentationByItemId,
  };
}

export function buildUpsertDeltaFromLegacyItem(input: {
  item: NotificationItem;
  userId: string;
  fromRevision: string;
  /** Force NEXT_IN_SESSION causal result. */
  causedByItemId?: string;
}): {
  delta: NotificationsDeltaV1;
  presentationByItemId: Record<string, NotificationItem>;
} {
  const v1 =
    input.causedByItemId && input.item.kind === 'result'
      ? toCausalResultItemV1(
          input.item.result,
          input.userId,
          input.causedByItemId,
        )
      : toContractItemV1(input.item, input.userId);
  const revision = bumpRevision(input.fromRevision, v1.sequence);
  const op: NotificationOperationV1 = {
    type: 'UPSERT_ITEM',
    revision,
    item: { ...v1, sequence: v1.sequence },
  };
  return {
    delta: {
      type: 'DELTA',
      fromRevision: input.fromRevision,
      revision,
      operations: [op],
    },
    presentationByItemId: { [v1.itemId]: input.item },
  };
}

export function buildRemoveDelta(input: {
  itemId: string;
  fromRevision: string;
  upsert?: NotificationItemV1;
  presentationByItemId?: Record<string, NotificationItem>;
}): {
  delta: NotificationsDeltaV1;
  presentationByItemId: Record<string, NotificationItem>;
} {
  const removeRev = bumpRevision(input.fromRevision, input.fromRevision);
  const ops: NotificationOperationV1[] = [
    { type: 'REMOVE_ITEM', revision: removeRev, itemId: input.itemId },
  ];
  let revision = removeRev;
  const presentationByItemId = { ...(input.presentationByItemId ?? {}) };
  if (input.upsert) {
    revision = bumpRevision(removeRev, input.upsert.sequence);
    ops.push({
      type: 'UPSERT_ITEM',
      revision,
      item: input.upsert,
    });
  }
  return {
    delta: {
      type: 'DELTA',
      fromRevision: input.fromRevision,
      revision,
      operations: ops,
    },
    presentationByItemId,
  };
}
