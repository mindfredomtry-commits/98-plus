import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';

const BACKFILL_DONE_KEY = 'backfill:result-seen:v1';
const BACKFILL_CUTOFF_KEY = 'backfill:result-seen:cutoff';

function resolveCutoff(explicit?: Date): Date {
  if (explicit) return explicit;
  const fromEnv = process.env.RESULT_SEEN_BACKFILL_CUTOFF;
  if (fromEnv) {
    const parsed = new Date(fromEnv);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date(Date.now() - 5 * 60 * 1000);
}

/** Mark legacy completed results as seen for both participants. */
export async function backfillLegacyResultSeen(
  cutoff?: Date,
): Promise<number> {
  const before = resolveCutoff(cutoff);

  const updatedCount = await prisma.$executeRaw`
    UPDATE "Ban"
    SET
      "senderResultSeenAt" = COALESCE("senderResultSeenAt", "completedAt", NOW()),
      "receiverResultSeenAt" = COALESCE("receiverResultSeenAt", "completedAt", NOW())
    WHERE
      "completedAt" IS NOT NULL
      AND "outcome" IS NOT NULL
      AND "createdAt" < ${before}
      AND ("senderResultSeenAt" IS NULL OR "receiverResultSeenAt" IS NULL)
  `;

  console.log('[backfill-result-seen]', {
    updatedCount,
    cutoff: before.toISOString(),
  });

  return Number(updatedCount);
}

/** One-time backfill on deploy — skips if already completed. */
export async function runResultSeenBackfillOnce(): Promise<number> {
  if ((await redis.exists(BACKFILL_DONE_KEY)) === 1) {
    return 0;
  }

  let cutoffIso = await redis.get(BACKFILL_CUTOFF_KEY);
  if (!cutoffIso) {
    cutoffIso = resolveCutoff().toISOString();
    await redis.set(BACKFILL_CUTOFF_KEY, cutoffIso);
  }

  const count = await backfillLegacyResultSeen(new Date(cutoffIso));
  await redis.set(BACKFILL_DONE_KEY, new Date().toISOString());
  return count;
}
