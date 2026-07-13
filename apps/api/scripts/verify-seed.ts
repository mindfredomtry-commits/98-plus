import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const price = await prisma.productProviderPrice.findFirst({
    where: { product: { code: 'premium_1m' }, provider: 'TELEGRAM_STARS' },
    select: {
      amount: true,
      currency: true,
      isActive: true,
      product: { select: { code: true, isVisible: true, entitlementDurationDays: true } },
    },
  });
  console.log('[verify-seed] premium_1m_stars', price);

  const visible = await prisma.product.count({ where: { isVisible: true, isActive: true } });
  console.log('[verify-seed] visible_active_products', visible);
}

main()
  .catch((e) => {
    console.error('[verify-seed] failed', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
