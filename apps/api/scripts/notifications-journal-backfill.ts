/**
 * One-time Notifications Journal backfill from current Ban pending state.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PHASE 9C CUTOVER — DO NOT RUN
 *
 * Global Ban + Journal reset precedes Notifications deploy. Journal starts
 * empty; only new post-deployment Ban mutations write Journal ops.
 * Historical backfill would reintroduce deleted Ban pollution.
 *
 * This script is retained for rare operational recovery only. It refuses to
 * run unless FORCE_LEGACY_BACKFILL=1 is set explicitly.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * TIMEOUT policy (legacy): EXCLUDE historical TIMEOUT from Journal backfill.
 *
 * Usage (legacy only):
 *   FORCE_LEGACY_BACKFILL=1 npx tsx --tsconfig apps/api/tsconfig.json \
 *     apps/api/scripts/notifications-journal-backfill.ts [--dry-run]
 *
 * Idempotent: skips when latest op for (userId,itemId) is already UPSERT_ITEM.
 * Do not run the non-dry-run command without explicit user approval.
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
  partyPublicFromUser,
  upsertItemOp,
} from '../src/notifications/notification-item-builders';
import type { AppendOperationInput } from '../src/notifications/notifications-contract-v1.schema';

const dryRun = process.argv.includes('--dry-run');
const forceLegacy = process.env.FORCE_LEGACY_BACKFILL === '1';

const OUTCOME_MAP: Record<string, string> = {
  BOTH_YES: 'both_yes',
  BOTH_NO: 'both_no',
  SPLIT: 'split',
  OVERBOARD: 'overboard',
  EXPIRED: 'expired',
};

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
  if (!forceLegacy) {
    console.error(
      '[notifications-journal-backfill] REFUSED — Phase 9C cutover uses empty Journal after global Ban reset. Set FORCE_LEGACY_BACKFILL=1 only for explicit legacy recovery.',
    );
    process.exit(2);
  }

  const counts = {
    incoming: 0,
    check: 0,
    result: 0,
    overboard: 0,
    skipped: 0,
    invalidPayload: 0,
    duplicateLogical: 0,
    users: new Set<string>(),
  };

  const pendingIncoming = await prisma.ban.findMany({
    where: {
      status: 'PENDING',
      receiverIncomingAckAt: null,
    },
    include: { sender: true, receiver: true },
    take: 5000,
  });

  const ops: AppendOperationInput[] = [];
  const seenKeys = new Set<string>();

  for (const ban of pendingIncoming) {
    const item = buildIncomingBanNotificationItemV1({
      userId: ban.receiverId,
      banId: ban.id,
      text: ban.text,
      durationMinutes: ban.durationMinutes,
      senderId: ban.senderId,
      receiverId: ban.receiverId,
      createdAt: ban.createdAt,
      sender: partyPublicFromUser(ban.sender),
      receiver: partyPublicFromUser(ban.receiver),
    });
    const key = `${ban.receiverId}:${item.itemId}`;
    if (seenKeys.has(key)) {
      counts.duplicateLogical += 1;
      continue;
    }
    seenKeys.add(key);
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
    include: { checkAnswers: true, sender: true, receiver: true },
    take: 5000,
  });

  for (const ban of checking) {
    for (const userId of [ban.senderId, ban.receiverId]) {
      if (ban.checkAnswers.some((a) => a.userId === userId)) continue;
      const item = buildCheckRequestNotificationItemV1({
        userId,
        banId: ban.id,
        text: ban.text,
        durationMinutes: ban.durationMinutes,
        checkDueAt: ban.checkDueAt,
        senderId: ban.senderId,
        receiverId: ban.receiverId,
        createdAt: ban.createdAt,
        sender: partyPublicFromUser(ban.sender),
        receiver: partyPublicFromUser(ban.receiver),
      });
      const key = `${userId}:${item.itemId}`;
      if (seenKeys.has(key)) {
        counts.duplicateLogical += 1;
        continue;
      }
      seenKeys.add(key);
      if (await latestOpIsUpsert(userId, item.itemId)) {
        counts.skipped += 1;
        continue;
      }
      ops.push(upsertItemOp(item));
      counts.check += 1;
      counts.users.add(userId);
    }
  }

  /** Policy A: exclude historical TIMEOUT from Journal backfill. */
  const timeoutExcluded = await prisma.ban.count({
    where: {
      status: { in: ['COMPLETED', 'OVERBOARD', 'FAILED', 'EXPIRED'] },
      outcome: 'TIMEOUT',
      completedAt: { not: null },
      OR: [{ senderResultSeenAt: null }, { receiverResultSeenAt: null }],
    },
  });

  const terminals = await prisma.ban.findMany({
    where: {
      status: { in: ['COMPLETED', 'OVERBOARD', 'FAILED', 'EXPIRED'] },
      outcome: { not: null, notIn: ['TIMEOUT'] },
      completedAt: { not: null },
      OR: [{ senderResultSeenAt: null }, { receiverResultSeenAt: null }],
    },
    include: { sender: true, receiver: true },
    take: 5000,
  });

  for (const ban of terminals) {
    const outcome = OUTCOME_MAP[String(ban.outcome)];
    if (!outcome) {
      counts.invalidPayload += 1;
      continue;
    }
    const parties: Array<{ userId: string; seen: Date | null }> = [
      { userId: ban.senderId, seen: ban.senderResultSeenAt },
      { userId: ban.receiverId, seen: ban.receiverResultSeenAt },
    ];
    for (const p of parties) {
      if (p.seen) continue;
      const item = buildBanResultNotificationItemV1({
        userId: p.userId,
        banId: ban.id,
        outcome,
        text: ban.text,
        completedAt: ban.completedAt!,
        senderId: ban.senderId,
        receiverId: ban.receiverId,
        sender: partyPublicFromUser(ban.sender),
        receiver: partyPublicFromUser(ban.receiver),
        deliveryPolicy: 'FIFO',
        causedByItemId: null,
      });
      const key = `${p.userId}:${item.itemId}`;
      if (seenKeys.has(key)) {
        counts.duplicateLogical += 1;
        continue;
      }
      seenKeys.add(key);
      if (await latestOpIsUpsert(p.userId, item.itemId)) {
        counts.skipped += 1;
        continue;
      }
      ops.push(upsertItemOp(item));
      counts.result += 1;
      if (outcome === 'overboard') counts.overboard += 1;
      counts.users.add(p.userId);
    }
  }

  console.log('[notifications-journal-backfill]', {
    dryRun,
    usersAffected: counts.users.size,
    INCOMING_BAN: counts.incoming,
    CHECK_REQUEST: counts.check,
    BAN_RESULT: counts.result,
    OVERBOARD: counts.overboard,
    TIMEOUT_excluded: timeoutExcluded,
    timeoutPolicy: 'EXCLUDE',
    skippedAlreadyPresent: counts.skipped,
    duplicateLogical: counts.duplicateLogical,
    invalidPayload: counts.invalidPayload,
    ops: ops.length,
  });

  if (dryRun || ops.length === 0) {
    return;
  }

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
