import 'dotenv/config';
import { backfillLegacyResultSeen } from '../src/services/result-seen-backfill';
import { prisma } from '../src/lib/prisma';

async function main() {
  const cutoffArg = process.argv.find((a) => a.startsWith('--cutoff='));
  const cutoff = cutoffArg
    ? new Date(cutoffArg.slice('--cutoff='.length))
    : undefined;

  const updatedCount = await backfillLegacyResultSeen(cutoff);
  console.log('[backfill-result-seen]', { updatedCount, manual: true });
}

main()
  .catch((err) => {
    console.error('[backfill-result-seen] failed', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
