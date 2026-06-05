/**
 * Dev/admin utility — clear overlay-related ban state for one user.
 *
 * Default: dry-run (counts only). Pass --confirm to apply soft-close updates.
 * Optional: --hard to delete ban rows (destructive; use only when needed).
 *
 * Usage:
 *   npm run db:clear-user-bans -- --username=Author98plus
 *   npm run db:clear-user-bans -- --username=Author98plus --confirm
 *   npm run db:clear-user-bans -- --username=Author98plus --confirm --hard
 */
import 'dotenv/config';
import type { BanStatus, InviteStatus, Prisma } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { redis } from '../src/lib/redis';
import { normalizeUsername } from '../src/services/invite.service';

const OPEN_BAN_STATUSES: BanStatus[] = [
  'PENDING',
  'ACTIVE',
  'REPLIED',
  'COUNTERED',
  'CHECKING',
];

const TERMINAL_BAN_STATUSES: BanStatus[] = [
  'COMPLETED',
  'OVERBOARD',
  'FAILED',
  'EXPIRED',
];

type Counts = {
  pendingIncomingUnacked: number;
  unseenSenderResults: number;
  unseenReceiverResults: number;
  openBansAsParticipant: number;
  pendingInvites: number;
  checkAnswersOnOpenBans: number;
  totalBansAsParticipant: number;
};

function parseArgs() {
  const usernameRaw =
    process.argv.find((a) => a.startsWith('--username='))?.slice(11) ??
    'Author98plus';
  const confirm = process.argv.includes('--confirm');
  const hard = process.argv.includes('--hard');
  return {
    username: normalizeUsername(usernameRaw),
    confirm,
    hard,
    dryRun: !confirm,
  };
}

function userBanScope(userId: string): Prisma.BanWhereInput {
  return {
    OR: [{ senderId: userId }, { receiverId: userId }],
  };
}

async function countTargets(
  userId: string,
  username: string,
): Promise<Counts> {
  // Sequential counts — PgBouncer transaction pool breaks parallel prepared statements.
  const pendingIncomingUnacked = await prisma.ban.count({
    where: {
      receiverId: userId,
      status: 'PENDING',
      receiverIncomingAckAt: null,
    },
  });
  const unseenSenderResults = await prisma.ban.count({
    where: {
      senderId: userId,
      senderResultSeenAt: null,
      status: { in: TERMINAL_BAN_STATUSES },
      outcome: { not: null },
      completedAt: { not: null },
    },
  });
  const unseenReceiverResults = await prisma.ban.count({
    where: {
      receiverId: userId,
      receiverResultSeenAt: null,
      status: { in: TERMINAL_BAN_STATUSES },
      outcome: { not: null },
      completedAt: { not: null },
    },
  });
  const openBansAsParticipant = await prisma.ban.count({
    where: {
      ...userBanScope(userId),
      status: { in: OPEN_BAN_STATUSES },
    },
  });
  const pendingInvites = await prisma.banInvite.count({
    where: {
      status: 'PENDING' as InviteStatus,
      OR: [
        { senderId: userId },
        { claimedById: userId },
        { targetUsername: username },
      ],
    },
  });
  const totalBansAsParticipant = await prisma.ban.count({
    where: userBanScope(userId),
  });

  const openBanIds = (
    await prisma.ban.findMany({
      where: {
        ...userBanScope(userId),
        status: { in: OPEN_BAN_STATUSES },
      },
      select: { id: true },
    })
  ).map((b) => b.id);

  const checkAnswersOnOpenBans =
    openBanIds.length === 0
      ? 0
      : await prisma.banCheckAnswer.count({
          where: { banId: { in: openBanIds } },
        });

  return {
    pendingIncomingUnacked,
    unseenSenderResults,
    unseenReceiverResults,
    openBansAsParticipant,
    pendingInvites,
    checkAnswersOnOpenBans,
    totalBansAsParticipant,
  };
}

async function clearUserRedisKeys(userId: string, dryRun: boolean) {
  const keys = [
    `presence:${userId}`,
    `cooldown:send:${userId}`,
    `cooldown:overboard:${userId}`,
  ];

  const openBanIds = (
    await prisma.ban.findMany({
      where: userBanScope(userId),
      select: { id: true },
    })
  ).map((b) => b.id);

  for (const banId of openBanIds) {
    keys.push(`cooldown:check:${banId}:${userId}`);
  }

  const existing: string[] = [];
  for (const key of keys) {
    if ((await redis.exists(key)) === 1) existing.push(key);
  }

  if (!dryRun && existing.length > 0) {
    await redis.del(...existing);
  }

  return { scanned: keys.length, deleted: existing.length, keys: existing };
}

async function softCloseUserBans(userId: string, username: string) {
  const now = new Date();

  const incomingAck = await prisma.ban.updateMany({
    where: {
      receiverId: userId,
      status: 'PENDING',
      receiverIncomingAckAt: null,
    },
    data: { receiverIncomingAckAt: now },
  });

  const senderResultsSeen = await prisma.ban.updateMany({
    where: {
      senderId: userId,
      senderResultSeenAt: null,
      status: { in: TERMINAL_BAN_STATUSES },
      outcome: { not: null },
      completedAt: { not: null },
    },
    data: { senderResultSeenAt: now },
  });

  const receiverResultsSeen = await prisma.ban.updateMany({
    where: {
      receiverId: userId,
      receiverResultSeenAt: null,
      status: { in: TERMINAL_BAN_STATUSES },
      outcome: { not: null },
      completedAt: { not: null },
    },
    data: { receiverResultSeenAt: now },
  });

  const expireAsSender = await prisma.ban.updateMany({
    where: {
      senderId: userId,
      status: { in: OPEN_BAN_STATUSES },
    },
    data: {
      status: 'EXPIRED',
      handledAt: now,
      completedAt: now,
      outcome: 'EXPIRED',
      senderResultSeenAt: now,
      checkDueAt: null,
      expiresAt: now,
    },
  });

  const expireAsReceiver = await prisma.ban.updateMany({
    where: {
      receiverId: userId,
      status: { in: OPEN_BAN_STATUSES },
    },
    data: {
      status: 'EXPIRED',
      handledAt: now,
      completedAt: now,
      outcome: 'EXPIRED',
      receiverResultSeenAt: now,
      receiverIncomingAckAt: now,
      checkDueAt: null,
      expiresAt: now,
    },
  });

  const expiredInvites = await prisma.banInvite.updateMany({
    where: {
      status: 'PENDING',
      OR: [
        { senderId: userId },
        { claimedById: userId },
        { targetUsername: username },
      ],
    },
    data: { status: 'EXPIRED' },
  });

  return {
    incomingAck: incomingAck.count,
    senderResultsSeen: senderResultsSeen.count,
    receiverResultsSeen: receiverResultsSeen.count,
    expiredOpenBans: expireAsSender.count + expireAsReceiver.count,
    expiredInvites: expiredInvites.count,
  };
}

async function hardDeleteUserBans(userId: string, username: string) {
  const banIds = (
    await prisma.ban.findMany({
      where: userBanScope(userId),
      select: { id: true },
    })
  ).map((b) => b.id);

  let deletedCheckAnswers = 0;
  let deletedBans = 0;

  if (banIds.length > 0) {
    const answers = await prisma.banCheckAnswer.deleteMany({
      where: { banId: { in: banIds } },
    });
    deletedCheckAnswers = answers.count;

    const children = await prisma.ban.deleteMany({
      where: { parentBanId: { in: banIds } },
    });
    const roots = await prisma.ban.deleteMany({
      where: { id: { in: banIds } },
    });
    deletedBans = children.count + roots.count;
  }

  const expiredInvites = await prisma.banInvite.updateMany({
    where: {
      status: 'PENDING',
      OR: [
        { senderId: userId },
        { claimedById: userId },
        { targetUsername: username },
      ],
    },
    data: { status: 'EXPIRED' },
  });

  return {
    deletedCheckAnswers,
    deletedBans,
    expiredInvites: expiredInvites.count,
  };
}

async function main() {
  const { username, confirm, hard, dryRun } = parseArgs();

  if (process.env.NODE_ENV === 'production' && !confirm) {
    console.error(
      '[clear-user-bans] Refusing to run in production without --confirm',
    );
    process.exit(1);
  }

  const user = await prisma.user.findFirst({
    where: { username: { equals: username, mode: 'insensitive' } },
    select: {
      id: true,
      username: true,
      telegramId: true,
      firstName: true,
    },
  });

  if (!user) {
    throw new Error(`User not found for username @${username}`);
  }

  console.log('[clear-user-bans] target', {
    userId: user.id,
    username: user.username,
    telegramId: user.telegramId.toString(),
    firstName: user.firstName,
    mode: dryRun ? 'dry-run' : hard ? 'hard' : 'soft',
  });

  const before = await countTargets(user.id, username);
  console.log('[clear-user-bans] would affect', before);

  if (dryRun) {
    console.log(
      '[clear-user-bans] dry-run only — re-run with --confirm to apply soft-close',
    );
    return;
  }

  const soft = await softCloseUserBans(user.id, username);
  console.log('[clear-user-bans] soft-close applied', soft);

  let hardResult: Awaited<ReturnType<typeof hardDeleteUserBans>> | null = null;
  if (hard) {
    hardResult = await hardDeleteUserBans(user.id, username);
    console.log('[clear-user-bans] hard-delete applied', hardResult);
  }

  const redisResult = await clearUserRedisKeys(user.id, false);
  console.log('[clear-user-bans] redis cleanup', redisResult);

  const after = await countTargets(user.id, username);
  console.log('[clear-user-bans] after', after);
  console.log('[clear-user-bans] done', {
    userId: user.id,
    username: user.username,
    soft,
    hard: hardResult,
    redis: redisResult,
  });
}

main()
  .catch((err) => {
    console.error('[clear-user-bans] failed', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    redis.disconnect();
  });
