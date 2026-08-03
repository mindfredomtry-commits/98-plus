/**
 * One-time Notifications Journal backfill from current Ban pending state.
 *
 * Decision A — deterministic UPSERT for currently supported pending items:
 * - pending incoming (PENDING, !receiverIncomingAckAt)
 * - pending check (CHECKING, user has not answered)
 * - unseen results (terminal + null *ResultSeenAt)
 *
 * Usage:
 *   npx tsx --tsconfig apps/api/tsconfig.json apps/api/scripts/notifications-journal-backfill.ts [--dry-run]
 *
 * Idempotent: skips when latest op for (userId,itemId) is already UPSERT_ITEM.
 * Does not destroy data. Does not redesign TIMEOUT policy (includes unseen TIMEOUT results).
 */
import { prisma } from '../src/lib/prisma';
import {
  appendJournalOpsFlatTx,
  publishCommittedNotificationDeltas,
} from '../src/notifications/notification-journal-commit';
import {
  buildBanResultNotificationItemV1,
  buildCheckRequestNotificationItemV1,
  buildIncomingBanNotificationItemV1,
  upsertItemOp,
} from '../src/notifications/notification-item-builders';
import type { AppendOperationInput } from '../src/notifications/notifications-contract-v1.schema';

const dryRun = process.argv.includes('--dry-run');

async function latestOpIsUpsert(
  userId: string,
  itemId: string,
): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ operationType: string }>>`
    SELECT "operationType"
    FROM "NotificationJournalEntry"
    WHERE "userId" = ${userId} AND "itemId" = ${itemId}
    ORDER BY "revision" DESC
    LIMIT 1
  `;
  return rows[0]?.operationType === 'UPSERT_ITEM';
}

async function main() {
  const counts = {
    incoming: 0,
    check: 0,
    result: 0,
    skipped: 0,
    users: new Set<string>(),
  };

  const pendingIncoming = await prisma.ban.findMany({
    where: {
      status: 'PENDING',
      receiverIncomingAckAt: null,
    },
    take: 5000,
  });

  const ops: AppendOperationInput[] = [];

  for (const ban of pendingIncoming) {
    const item = buildIncomingBanNotificationItemV1({
      userId: ban.receiverId,
      banId: ban.id,
      text: ban.text,
      durationMinutes: ban.durationMinutes,
      senderId: ban.senderId,
      receiverId: ban.receiverId,
      createdAt: ban.createdAt,
    });
    if (await latestOpIsUpsert(ban.receiverId, item.itemId)) {
      counts.skipped += 1;
      continue;
    }
    ops.push(upsertItemOp(item));
    counts.incoming += 1;
    counts.users.add(ban.receiverId);
  }

  const checking = await prisma.ban.findMany({
    where: { status: 'CHECKING' },
    include: { checkAnswers: true },
    take: 5000,
  });

  for (const ban of checking) {
    for (const userId of [ban.senderId, ban.receiverId]) {
      if (ban.checkAnswers.some((a) => a.userId === userId)) continue;
      const item = buildCheckRequestNotificationItemV1({
        userId,
        banId: ban.id,
        text: ban.text,
        checkDueAt: ban.checkDueAt,
        senderId: ban.senderId,
        receiverId: ban.receiverId,
        createdAt: ban.createdAt,
      });
      if (await latestOpIsUpsert(userId, item.itemId)) {
        counts.skipped += 1;
        continue;
      }
      ops.push(upsertItemOp(item));
      counts.check += 1;
      counts.users.add(userId);
    }
  }

  const terminals = await prisma.ban.findMany({
    where: {
      status: { in: ['COMPLETED', 'OVERBOARD', 'FAILED', 'EXPIRED'] },
      outcome: { not: null },
      completedAt: { not: null },
      OR: [{ senderResultSeenAt: null }, { receiverResultSeenAt: null }],
    },
    take: 5000,
  });

  for (const ban of terminals) {
    const parties: Array<{ userId: string; seen: Date | null }> = [
      { userId: ban.senderId, seen: ban.senderResultSeenAt },
      { userId: ban.receiverId, seen: ban.receiverResultSeenAt },
    ];
    for (const p of parties) {
      if (p.seen) continue;
      const item = buildBanResultNotificationItemV1({
        userId: p.userId,
        banId: ban.id,
        outcome: String(ban.outcome).toLowerCase().replace(/_/g, '_'),
        text: ban.text,
        completedAt: ban.completedAt!,
        senderId: ban.senderId,
        receiverId: ban.receiverId,
        deliveryPolicy: 'FIFO',
        causedByItemId: null,
      });
      // Normalize prisma enum to shared lowercase outcome
      const outcomeMap: Record<string, string> = {
        BOTH_YES: 'both_yes',
        BOTH_NO: 'both_no',
        SPLIT: 'split',
        OVERBOARD: 'overboard',
        TIMEOUT: 'timeout',
        EXPIRED: 'expired',
      };
      item.payload = {
        ...item.payload,
        kind: 'BAN_RESULT',
        outcome: outcomeMap[String(ban.outcome)] ?? String(ban.outcome),
      };
      if (await latestOpIsUpsert(p.userId, item.itemId)) {
        counts.skipped += 1;
        continue;
      }
      ops.push(upsertItemOp(item));
      counts.result += 1;
      counts.users.add(p.userId);
    }
  }

  console.log('[notifications-journal-backfill]', {
    dryRun,
    incoming: counts.incoming,
    check: counts.check,
    result: counts.result,
    skipped: counts.skipped,
    users: counts.users.size,
    ops: ops.length,
  });

  if (dryRun || ops.length === 0) {
    return;
  }

  // Chunk by 50 ops per transaction to bound lock time.
  const chunkSize = 50;
  for (let i = 0; i < ops.length; i += chunkSize) {
    const chunk = ops.slice(i, i + chunkSize);
    const deltas = await prisma.$transaction(async (tx) =>
      appendJournalOpsFlatTx(tx, chunk),
    );
    publishCommittedNotificationDeltas(deltas);
  }

  console.log('[notifications-journal-backfill] committed', {
    ops: ops.length,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
