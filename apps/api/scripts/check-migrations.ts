import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const tables = await prisma.$queryRaw<
    { tablename: string }[]
  >`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;

  console.log('[check-migrations] public_tables_count', tables.length);
  const monetization = tables
    .map((t) => t.tablename)
    .filter((n) =>
      ['Product', 'Payment', 'Plan', 'MonetizationEvent', 'Entitlement', 'ProductProviderPrice'].includes(n),
    );
  console.log('[check-migrations] monetization_tables', monetization);
}
main()
  .catch((e) => {
    console.error('[check-migrations] failed', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
