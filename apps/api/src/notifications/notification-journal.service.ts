/**
 * Atomic Notifications Journal writer (Contract V1).
 *
 * Must be called inside an existing Prisma transaction.
 * Does not publish WebSocket events (caller publishes only after commit).
 *
 * Duplicate business strategy:
 * - Always appends a new revision (append-only).
 * - Repeated UPSERT of the same itemId preserves itemSequence.
 * - Repeated REMOVE is allowed and keeps the item absent from snapshot.
 * - Callers should avoid meaningless duplicates; the journal remains correct.
 */
import type { Prisma } from '@prisma/client';
import {
  assertDeliveryPolicyV1,
  notificationItemIdV1,
  type NotificationItemV1,
  type NotificationOperationV1,
} from '@98plus/shared';
import {
  appendOperationInputSchema,
  type AppendOperationInput,
} from './notifications-contract-v1.schema';

export type NotificationJournalTx = Prisma.TransactionClient;

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
  payload: Prisma.JsonValue | null;
  createdAt: Date;
};

function revisionToString(n: bigint): string {
  return n.toString(10);
}

async function lockUserJournal(
  tx: NotificationJournalTx,
  userId: string,
): Promise<void> {
  // Serialize per-user journal writes within the transaction.
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtext(${userId}))
  `;
}

async function latestItemSequence(
  tx: NotificationJournalTx,
  userId: string,
  itemId: string,
): Promise<bigint | null> {
  const rows = await tx.$queryRaw<Array<{ itemSequence: bigint | null }>>`
    SELECT "itemSequence"
    FROM "NotificationJournalEntry"
    WHERE "userId" = ${userId}
      AND "itemId" = ${itemId}
      AND "operationType" = 'UPSERT_ITEM'
      AND "itemSequence" IS NOT NULL
    ORDER BY "revision" DESC
    LIMIT 1
  `;
  return rows[0]?.itemSequence ?? null;
}

function rowToOperation(row: JournalRow): NotificationOperationV1 {
  if (row.operationType === 'REMOVE_ITEM') {
    return {
      type: 'REMOVE_ITEM',
      revision: revisionToString(row.revision),
      itemId: row.itemId,
    };
  }
  if (row.operationType !== 'UPSERT_ITEM' || !row.payload || !row.itemSequence) {
    throw new Error(
      `Invalid UPSERT journal row revision=${row.revision.toString()}`,
    );
  }
  const payload = row.payload as NotificationItemV1['payload'];
  const item: NotificationItemV1 = {
    itemId: row.itemId,
    userId: row.userId,
    kind: row.itemKind as NotificationItemV1['kind'],
    banId: row.banId!,
    sequence: revisionToString(row.itemSequence),
    createdAt: row.createdAt.toISOString(),
    deliveryPolicy: row.deliveryPolicy as NotificationItemV1['deliveryPolicy'],
    causedByItemId: row.causedByItemId,
    payload,
  };
  return {
    type: 'UPSERT_ITEM',
    revision: revisionToString(row.revision),
    item,
  };
}

/**
 * Append validated notification operations inside an open transaction.
 * Returns committed-shaped Contract V1 operations (with assigned revisions).
 */
export async function appendNotificationOperationsV1(
  tx: NotificationJournalTx,
  operations: AppendOperationInput[],
): Promise<NotificationOperationV1[]> {
  if (operations.length === 0) return [];

  const parsed = operations.map((op) => appendOperationInputSchema.parse(op));
  const userIds = new Set(
    parsed.map((op) =>
      op.type === 'UPSERT_ITEM' ? op.item.userId : op.userId,
    ),
  );
  if (userIds.size !== 1) {
    throw new Error(
      'appendNotificationOperationsV1: all operations must share one userId',
    );
  }
  const userId = [...userIds][0]!;
  await lockUserJournal(tx, userId);

  const committed: NotificationOperationV1[] = [];

  for (const op of parsed) {
    if (op.type === 'REMOVE_ITEM') {
      const rows = await tx.$queryRaw<JournalRow[]>`
        INSERT INTO "NotificationJournalEntry" (
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
        )
        VALUES (
          ${op.userId},
          'REMOVE_ITEM',
          ${op.itemId},
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          CURRENT_TIMESTAMP
        )
        RETURNING *
      `;
      committed.push(rowToOperation(rows[0]!));
      continue;
    }

    const item = op.item;
    assertDeliveryPolicyV1({
      deliveryPolicy: item.deliveryPolicy,
      causedByItemId: item.causedByItemId,
    });
    const expectedId = notificationItemIdV1(item.kind, item.banId);
    if (item.itemId !== expectedId) {
      throw new Error(`itemId mismatch: expected ${expectedId}`);
    }

    const existingSequence = await latestItemSequence(
      tx,
      item.userId,
      item.itemId,
    );

    // Allocate revision from the identity sequence, set itemSequence =
    // existing sequence (preserve FIFO) or the new revision for first UPSERT.
    const rows = await tx.$queryRaw<JournalRow[]>`
      WITH next_rev AS (
        SELECT nextval(
          pg_get_serial_sequence('"NotificationJournalEntry"', 'revision')
        ) AS revision
      )
      INSERT INTO "NotificationJournalEntry" (
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
      )
      SELECT
        next_rev.revision,
        ${item.userId},
        'UPSERT_ITEM',
        ${item.itemId},
        COALESCE(${existingSequence}, next_rev.revision),
        ${item.kind},
        ${item.banId},
        ${item.deliveryPolicy},
        ${item.causedByItemId},
        ${JSON.stringify(item.payload)}::jsonb,
        CURRENT_TIMESTAMP
      FROM next_rev
      RETURNING *
    `;

    const row = rows[0]!;
    // Prefer item.createdAt metadata from caller when valid ISO; store row time
    // is journal time — Contract item.createdAt is payload/business metadata
    // already inside payload / item.createdAt field rebuilt from input.
    const operation = rowToOperation(row);
    if (operation.type === 'UPSERT_ITEM') {
      operation.item = {
        ...operation.item,
        createdAt: item.createdAt,
        payload: item.payload,
      };
    }
    committed.push(operation);
  }

  return committed;
}
