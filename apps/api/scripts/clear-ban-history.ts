/**
 * Dev/admin utility — remove terminal (history) bans only.
 *
 * Does NOT delete users or open bans (PENDING / ACTIVE / REPLIED / CHECKING).
 *
 * Usage:
 *   npm run db:clear-ban-history
 *   npm run db:clear-ban-history -- --confirm
 *   npm run db:clear-ban-history -- --username=dev_user --confirm
 */
import 'dotenv/config';
import type { BanStatus, Prisma } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { normalizeUsername } from '../src/services/invite.service';

const HISTORY_BAN_STATUSES: BanStatus[] = [
  'COMPLETED',
  'EXPIRED',
  'FAILED',
  'OVERBOARD',
  'COUNTERED',
];

const PROTECTED_BAN_STATUSES: BanStatus[] = [
  'PENDING',
  'ACTIVE',
  'REPLIED',
  'CHECKING',
];

function parseArgs() {
  const usernameRaw = process.argv
    .find((a) => a.startsWith('--username='))
    ?.slice('--username='.length);
  const confirm = process.argv.includes('--confirm');
  return {
    username: usernameRaw ? normalizeUsername(usernameRaw) : null,
    confirm,
    dryRun: !confirm,
  };
}

function historyBanWhere(username: string | null): Prisma.BanWhereInput {
  const scope: Prisma.BanWhereInput = {
    status: { in: HISTORY_BAN_STATUSES },
  };

  if (!username) return scope;

  return {
    AND: [
      scope,
      {
        OR: [
          { sender: { username: { equals: username, mode: 'insensitive' } } },
          { receiver: { username: { equals: username, mode: 'insensitive' } } },
        ],
      },
    ],
  };
}

async function countHistoryTargets(where: Prisma.BanWhereInput) {
  // Sequential counts — PgBouncer transaction pool breaks parallel prepared statements.
  const historyBans = await prisma.ban.count({ where });
  const protectedBans = await prisma.ban.count({
    where: { status: { in: PROTECTED_BAN_STATUSES } },
  });

  const historyIds = (
    await prisma.ban.findMany({
      where,
      select: { id: true },
    })
  ).map((b) => b.id);

  let checkAnswers = 0;
  let counterChildren = 0;
  if (historyIds.length > 0) {
    checkAnswers = await prisma.banCheckAnswer.count({
      where: { banId: { in: historyIds } },
    });
    counterChildren = await prisma.ban.count({
      where: {
        parentBanId: { in: historyIds },
        status: { in: HISTORY_BAN_STATUSES },
      },
    });
  }

  return {
    historyBans,
    checkAnswers,
    counterChildren,
    protectedBans,
    historyIds,
  };
}

async function deleteHistoryBans(where: Prisma.BanWhereInput) {
  const historyIds = (
    await prisma.ban.findMany({
      where,
      select: { id: true },
    })
  ).map((b) => b.id);

  if (historyIds.length === 0) {
    return {
      deletedCheckAnswers: 0,
      deletedCounterChildren: 0,
      deletedHistoryBans: 0,
    };
  }

  const deletedCheckAnswers = await prisma.banCheckAnswer.deleteMany({
    where: { banId: { in: historyIds } },
  });

  const deletedCounterChildren = await prisma.ban.deleteMany({
    where: {
      parentBanId: { in: historyIds },
      status: { in: HISTORY_BAN_STATUSES },
    },
  });

  const deletedHistoryBans = await prisma.ban.deleteMany({ where });

  return {
    deletedCheckAnswers: deletedCheckAnswers.count,
    deletedCounterChildren: deletedCounterChildren.count,
    deletedHistoryBans: deletedHistoryBans.count,
  };
}

async function main() {
  const { username, confirm, dryRun } = parseArgs();

  if (process.env.NODE_ENV === 'production' && !confirm) {
    console.error(
      '[clear-ban-history] Refusing to run in production without --confirm',
    );
    process.exit(1);
  }

  const where = historyBanWhere(username);

  console.log('[clear-ban-history] mode', {
    dryRun,
    scope: username ? `@${username}` : 'all users',
    statuses: HISTORY_BAN_STATUSES,
    protected: PROTECTED_BAN_STATUSES,
  });

  const before = await countHistoryTargets(where);
  console.log('[clear-ban-history] dry-run counts', {
    historyBans: before.historyBans,
    checkAnswersOnHistory: before.checkAnswers,
    counterChildrenLinked: before.counterChildren,
    protectedOpenBansInDb: before.protectedBans,
  });

  if (dryRun) {
    console.log(
      '[clear-ban-history] dry-run only — re-run with --confirm to delete terminal bans',
    );
    return;
  }

  const deleted = await deleteHistoryBans(where);
  const after = await countHistoryTargets(where);

  console.log('[clear-ban-history] deleted', deleted);
  console.log('[clear-ban-history] after', {
    historyBans: after.historyBans,
    protectedOpenBansInDb: after.protectedBans,
  });
  console.log('[clear-ban-history] done');
}

main()
  .catch((err) => {
    console.error('[clear-ban-history] failed', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
