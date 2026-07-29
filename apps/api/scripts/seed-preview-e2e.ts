import {
  BanStatus,
  InteractionOutcome,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const prisma = new PrismaClient();

function assertPreviewOnly(): void {
  const environment = process.env.RAILWAY_ENVIRONMENT_NAME ?? '';
  const databaseUrl = process.env.DATABASE_URL ?? '';
  if (
    environment.toLowerCase() === 'production' ||
    /supabase\.com/i.test(databaseUrl)
  ) {
    throw new Error('Refusing to seed a production database');
  }
}

function ownerTelegramId(): bigint {
  const raw = process.env.PREVIEW_SEED_OWNER_TELEGRAM_ID?.trim();
  if (!raw || !/^\d+$/.test(raw)) {
    throw new Error('PREVIEW_SEED_OWNER_TELEGRAM_ID is required');
  }
  return BigInt(raw);
}

async function bootstrapPreviewAnalytics(): Promise<void> {
  await prisma.$executeRawUnsafe('CREATE SCHEMA IF NOT EXISTS analytics');
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE VIEW analytics.v_relationship_daily_facts_v1 AS
    SELECT
      b."senderId"::text AS viewer_user_id,
      b."receiverId"::text AS other_user_id,
      COALESCE(b."completedAt", b."createdAt")::date AS activity_date,
      1::bigint AS ban_sent_count,
      0::bigint AS ban_received_count,
      0::bigint AS reply_sent_count,
      0::bigint AS reply_received_count,
      CASE WHEN b."acceptedAt" IS NOT NULL THEN 1 ELSE 0 END::bigint
        AS sent_accepted_count,
      0::bigint AS received_accepted_count,
      CASE WHEN b.status = 'COMPLETED' THEN 1 ELSE 0 END::bigint
        AS sent_completed_count,
      0::bigint AS received_completed_count,
      CASE WHEN b.outcome = 'OVERBOARD' THEN 1 ELSE 0 END::bigint
        AS overboard_count,
      CASE WHEN b.outcome = 'BOTH_YES' THEN 1 ELSE 0 END::bigint
        AS both_yes_count,
      CASE WHEN b.outcome = 'BOTH_NO' THEN 1 ELSE 0 END::bigint
        AS both_no_count,
      CASE WHEN b.outcome = 'SPLIT' THEN 1 ELSE 0 END::bigint
        AS split_count,
      CASE WHEN b.outcome = 'TIMEOUT' THEN 1 ELSE 0 END::bigint
        AS timeout_count,
      CASE WHEN b.outcome = 'EXPIRED' THEN 1 ELSE 0 END::bigint
        AS expired_count,
      1::bigint AS interaction_count
    FROM "Ban" b
    UNION ALL
    SELECT
      b."receiverId"::text AS viewer_user_id,
      b."senderId"::text AS other_user_id,
      COALESCE(b."completedAt", b."createdAt")::date AS activity_date,
      0::bigint AS ban_sent_count,
      1::bigint AS ban_received_count,
      0::bigint AS reply_sent_count,
      0::bigint AS reply_received_count,
      0::bigint AS sent_accepted_count,
      CASE WHEN b."acceptedAt" IS NOT NULL THEN 1 ELSE 0 END::bigint
        AS received_accepted_count,
      0::bigint AS sent_completed_count,
      CASE WHEN b.status = 'COMPLETED' THEN 1 ELSE 0 END::bigint
        AS received_completed_count,
      CASE WHEN b.outcome = 'OVERBOARD' THEN 1 ELSE 0 END::bigint
        AS overboard_count,
      CASE WHEN b.outcome = 'BOTH_YES' THEN 1 ELSE 0 END::bigint
        AS both_yes_count,
      CASE WHEN b.outcome = 'BOTH_NO' THEN 1 ELSE 0 END::bigint
        AS both_no_count,
      CASE WHEN b.outcome = 'SPLIT' THEN 1 ELSE 0 END::bigint
        AS split_count,
      CASE WHEN b.outcome = 'TIMEOUT' THEN 1 ELSE 0 END::bigint
        AS timeout_count,
      CASE WHEN b.outcome = 'EXPIRED' THEN 1 ELSE 0 END::bigint
        AS expired_count,
      1::bigint AS interaction_count
    FROM "Ban" b
  `);
  const overviewSql = readFileSync(
    join(
      __dirname,
      '../prisma/analytics/APPLY_READY_relationship_overview_v1.sql',
    ),
    'utf8',
  );
  await prisma.$executeRawUnsafe(overviewSql);
}

async function main() {
  assertPreviewOnly();
  await bootstrapPreviewAnalytics();

  const owner = await prisma.user.upsert({
    where: { telegramId: ownerTelegramId() },
    create: {
      telegramId: ownerTelegramId(),
      username: process.env.PREVIEW_SEED_OWNER_USERNAME ?? 'preview_owner',
      firstName: process.env.PREVIEW_SEED_OWNER_FIRST_NAME ?? 'Preview Owner',
      isOnboarded: true,
      energy: 100,
      lastSeenAt: new Date(),
    },
    update: {
      isOnboarded: true,
      energy: 100,
      lastSeenAt: new Date(),
    },
  });

  const peers = await Promise.all([
    prisma.user.upsert({
      where: { telegramId: 9_900_000_001n },
      create: {
        telegramId: 9_900_000_001n,
        username: 'preview_alina',
        firstName: 'Алина',
        isOnboarded: true,
        energy: 95,
        lastSeenAt: new Date(),
      },
      update: {
        username: 'preview_alina',
        firstName: 'Алина',
        isOnboarded: true,
        lastSeenAt: new Date(),
      },
    }),
    prisma.user.upsert({
      where: { telegramId: 9_900_000_002n },
      create: {
        telegramId: 9_900_000_002n,
        username: 'preview_maks',
        firstName: 'Макс',
        isOnboarded: true,
        energy: 90,
        lastSeenAt: new Date(),
      },
      update: {
        username: 'preview_maks',
        firstName: 'Макс',
        isOnboarded: true,
        lastSeenAt: new Date(),
      },
    }),
  ]);

  for (const peer of peers) {
    await prisma.socialContact.upsert({
      where: {
        ownerId_contactUsername: {
          ownerId: owner.id,
          contactUsername: peer.username!,
        },
      },
      create: {
        ownerId: owner.id,
        contactUserId: peer.id,
        contactUsername: peer.username!,
        contactFirstName: peer.firstName,
        lastChallengeText: 'preview relationship history',
        interactionCount: 4,
        lastSource: 'PREVIEW_SEED',
      },
      update: {
        contactUserId: peer.id,
        contactFirstName: peer.firstName,
        lastChallengeText: 'preview relationship history',
        interactionCount: 4,
        lastInteractionAt: new Date(),
        lastSource: 'PREVIEW_SEED',
      },
    });
  }

  const peer = peers[0];
  const [userAId, userBId] =
    owner.id < peer.id ? [owner.id, peer.id] : [peer.id, owner.id];
  const thread = await prisma.banThread.upsert({
    where: { userAId_userBId: { userAId, userBId } },
    create: { userAId, userBId },
    update: {},
  });
  const completedAt = new Date(Date.now() - 60 * 60 * 1000);
  const history = [
    {
      id: `preview-history-${owner.id}-${peer.id}`,
      senderId: owner.id,
      receiverId: peer.id,
      text: 'не откладывать важное',
    },
    {
      id: `preview-history-${peer.id}-${owner.id}`,
      senderId: peer.id,
      receiverId: owner.id,
      text: 'не забывать отдыхать',
    },
  ];
  for (const row of history) {
    await prisma.ban.upsert({
      where: { id: row.id },
      create: {
        ...row,
        threadId: thread.id,
        durationMinutes: 30,
        status: BanStatus.COMPLETED,
        outcome: InteractionOutcome.BOTH_YES,
        acceptedAt: completedAt,
        completedAt,
        handledAt: completedAt,
        senderResultSeenAt: completedAt,
        receiverResultSeenAt: completedAt,
      },
      update: {
        status: BanStatus.COMPLETED,
        outcome: InteractionOutcome.BOTH_YES,
        completedAt,
      },
    });
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  await prisma.pairDailyStat.upsert({
    where: { userAId_userBId_date: { userAId, userBId, date: today } },
    create: {
      userAId,
      userBId,
      date: today,
      successCount: 2,
      interactionCount: 4,
    },
    update: {
      successCount: 2,
      interactionCount: 4,
    },
  });

  const analyticsFunctions = await prisma.$queryRaw<
    Array<{ overview_function: string | null }>
  >(Prisma.sql`
    select to_regprocedure(
      'analytics.get_relationship_overview_v1(text,text,date)'
    )::text as overview_function
  `);

  console.log('[preview-seed]', {
    ownerId: owner.id,
    ownerTelegramId: owner.telegramId.toString(),
    contacts: peers.map((item) => ({
      id: item.id,
      username: item.username,
    })),
    completedHistory: history.length,
    relationshipOverviewFunctionInstalled:
      analyticsFunctions[0]?.overview_function != null,
  });
}

main()
  .catch((error) => {
    console.error('[preview-seed] failed', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
