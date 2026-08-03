/**
 * Notifications Sync read model (Contract V1).
 *
 * Current items = latest operation per (userId, itemId) is UPSERT_ITEM.
 * Derived from append-only journal (no projection table).
 */
import type {
  NotificationItemV1,
  NotificationOperationV1,
  NotificationsSyncResponseV1,
} from '@98plus/shared';
import { prisma } from '../lib/prisma';

type JournalRow = {
  revision: bigint;
  userId: string;
  operationType: string;
  itemId: string;
  itemSequence: bigint | null;
  itemKind: string | null;
  banId: string | null;
  deliveryPolicy: string | null;
  causedByItemId: string | null;
  payload: unknown;
  createdAt: Date;
};

function revStr(n: bigint): string {
  return n.toString(10);
}

function parseAfterRevision(
  afterRevision: string | undefined,
): bigint | null {
  if (afterRevision == null || afterRevision === '') return null;
  if (!/^\d+$/.test(afterRevision)) return null;
  try {
    return BigInt(afterRevision);
  } catch {
    return null;
  }
}

function rowToUpsertItem(row: JournalRow): NotificationItemV1 {
  return {
    itemId: row.itemId,
    userId: row.userId,
    kind: row.itemKind as NotificationItemV1['kind'],
    banId: row.banId!,
    sequence: revStr(row.itemSequence!),
    createdAt:
      typeof (row.payload as { createdAt?: string } | null)?.createdAt ===
      'string'
        ? (row.payload as { createdAt: string }).createdAt
        : row.createdAt.toISOString(),
    deliveryPolicy:
      row.deliveryPolicy as NotificationItemV1['deliveryPolicy'],
    causedByItemId: row.causedByItemId,
    payload: row.payload as NotificationItemV1['payload'],
  };
}

function rowToOperation(row: JournalRow): NotificationOperationV1 {
  if (row.operationType === 'REMOVE_ITEM') {
    return {
      type: 'REMOVE_ITEM',
      revision: revStr(row.revision),
      itemId: row.itemId,
    };
  }
  return {
    type: 'UPSERT_ITEM',
    revision: revStr(row.revision),
    item: rowToUpsertItem(row),
  };
}

async function latestRevisionForUser(userId: string): Promise<bigint> {
  const rows = await prisma.$queryRaw<Array<{ revision: bigint | null }>>`
    SELECT MAX("revision") AS revision
    FROM "NotificationJournalEntry"
    WHERE "userId" = ${userId}
  `;
  return rows[0]?.revision ?? 0n;
}

async function revisionExistsForUser(
  userId: string,
  revision: bigint,
): Promise<boolean> {
  if (revision === 0n) return true;
  const rows = await prisma.$queryRaw<Array<{ ok: number }>>`
    SELECT 1 AS ok
    FROM "NotificationJournalEntry"
    WHERE "userId" = ${userId} AND "revision" = ${revision}
    LIMIT 1
  `;
  return rows.length > 0;
}

async function buildSnapshot(
  userId: string,
): Promise<Extract<NotificationsSyncResponseV1, { type: 'SNAPSHOT' }>> {
  // Latest operation per itemId (DISTINCT ON).
  const latest = await prisma.$queryRaw<JournalRow[]>`
    SELECT DISTINCT ON ("itemId")
      "revision",
      "userId",
      "operationType",
      "itemId",
      "itemSequence",
      "itemKind",
      "banId",
      "deliveryPolicy",
      "causedByItemId",
      "payload",
      "createdAt"
    FROM "NotificationJournalEntry"
    WHERE "userId" = ${userId}
    ORDER BY "itemId", "revision" DESC
  `;

  const items = latest
    .filter((row) => row.operationType === 'UPSERT_ITEM' && row.itemSequence != null)
    .map(rowToUpsertItem)
    .sort((a, b) => {
      const seq = BigInt(a.sequence) - BigInt(b.sequence);
      if (seq < 0n) return -1;
      if (seq > 0n) return 1;
      return a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0;
    });

  const revision = await latestRevisionForUser(userId);
  return {
    type: 'SNAPSHOT',
    revision: revStr(revision),
    items,
  };
}

/**
 * Sync read:
 * - no afterRevision → SNAPSHOT
 * - valid afterRevision → DELTA of ops with revision > after
 * - invalid/unsupported afterRevision → SNAPSHOT
 */
export async function getNotificationsSyncV1(input: {
  userId: string;
  afterRevision?: string;
}): Promise<NotificationsSyncResponseV1> {
  const after = parseAfterRevision(input.afterRevision);
  if (after == null) {
    return buildSnapshot(input.userId);
  }

  const known = await revisionExistsForUser(input.userId, after);
  if (!known) {
    return buildSnapshot(input.userId);
  }

  const rows = await prisma.$queryRaw<JournalRow[]>`
    SELECT
      "revision",
      "userId",
      "operationType",
      "itemId",
      "itemSequence",
      "itemKind",
      "banId",
      "deliveryPolicy",
      "causedByItemId",
      "payload",
      "createdAt"
    FROM "NotificationJournalEntry"
    WHERE "userId" = ${input.userId}
      AND "revision" > ${after}
    ORDER BY "revision" ASC
  `;

  if (rows.length === 0) {
    return {
      type: 'DELTA',
      fromRevision: revStr(after),
      revision: revStr(after),
      operations: [],
    };
  }

  const operations = rows.map(rowToOperation);
  const head = rows[rows.length - 1]!;
  return {
    type: 'DELTA',
    fromRevision: revStr(after),
    revision: revStr(head.revision),
    operations,
  };
}
