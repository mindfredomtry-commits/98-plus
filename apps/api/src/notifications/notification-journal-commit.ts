/**
 * Multi-user journal append inside a transaction + post-commit WS publish.
 *
 * Revision is a global serial used as a per-user cursor. Cross-user gaps are
 * valid: each user's fromRevision is that user's pre-append head, not global-1.
 */
import type { NotificationOperationV1 } from '@98plus/shared';
import type { AppendOperationInput } from './notifications-contract-v1.schema';
import {
  appendNotificationOperationsV1,
  type NotificationJournalTx,
} from './notification-journal.service';
import { publishNotificationsDeltaV1 } from '../websocket/notifications-delta-v1';

export type CommittedUserDeltaV1 = {
  userId: string;
  fromRevision: string;
  revision: string;
  operations: NotificationOperationV1[];
};

function revStr(n: bigint): string {
  return n.toString(10);
}

export async function latestRevisionForUserTx(
  tx: NotificationJournalTx,
  userId: string,
): Promise<bigint> {
  const rows = await tx.$queryRaw<Array<{ revision: bigint | null }>>`
    SELECT MAX("revision") AS revision
    FROM "NotificationJournalEntry"
    WHERE "userId" = ${userId}
  `;
  return rows[0]?.revision ?? 0n;
}

export function groupAppendOpsByUser(
  ops: AppendOperationInput[],
): Record<string, AppendOperationInput[]> {
  const out: Record<string, AppendOperationInput[]> = {};
  for (const op of ops) {
    const userId =
      op.type === 'UPSERT_ITEM' ? op.item.userId : op.userId;
    if (!out[userId]) out[userId] = [];
    out[userId]!.push(op);
  }
  return out;
}

/**
 * Append ops for one or more users inside an open transaction.
 * Returns one delta envelope per user that received operations.
 */
export async function appendJournalOpsByUserTx(
  tx: NotificationJournalTx,
  opsByUser: Record<string, AppendOperationInput[]>,
): Promise<CommittedUserDeltaV1[]> {
  const deltas: CommittedUserDeltaV1[] = [];
  // Deterministic user order for lock acquisition.
  const userIds = Object.keys(opsByUser).sort();
  for (const userId of userIds) {
    const ops = opsByUser[userId] ?? [];
    if (ops.length === 0) continue;
    const prev = await latestRevisionForUserTx(tx, userId);
    const operations = await appendNotificationOperationsV1(tx, ops);
    if (operations.length === 0) continue;
    const last = operations[operations.length - 1]!;
    deltas.push({
      userId,
      fromRevision: revStr(prev),
      revision: last.revision,
      operations,
    });
  }
  return deltas;
}

export async function appendJournalOpsFlatTx(
  tx: NotificationJournalTx,
  ops: AppendOperationInput[],
): Promise<CommittedUserDeltaV1[]> {
  return appendJournalOpsByUserTx(tx, groupAppendOpsByUser(ops));
}

/** Call only after the transaction that produced these deltas has committed. */
export function publishCommittedNotificationDeltas(
  deltas: CommittedUserDeltaV1[],
): void {
  for (const d of deltas) {
    if (d.operations.length === 0) continue;
    const result = publishNotificationsDeltaV1({
      userId: d.userId,
      fromRevision: d.fromRevision,
      revision: d.revision,
      operations: d.operations,
    });
    if (!result.published) {
      console.warn('[notifications-delta-v1] publish skipped', {
        userId: d.userId,
        reason: result.reason,
        revision: d.revision,
      });
    }
  }
}

export function deltaForUser(
  deltas: CommittedUserDeltaV1[],
  userId: string,
): CommittedUserDeltaV1 | null {
  return deltas.find((d) => d.userId === userId) ?? null;
}

export function toNotificationsDeltaV1(
  d: CommittedUserDeltaV1 | null,
): import('@98plus/shared').NotificationsDeltaV1 | null {
  if (!d || d.operations.length === 0) return null;
  return {
    type: 'DELTA',
    fromRevision: d.fromRevision,
    revision: d.revision,
    operations: d.operations,
  };
}
