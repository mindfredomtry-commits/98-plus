import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const REAL_PRODUCT_CODES = new Set([
  'premium_1m',
  'premium_3m',
  'premium_6m',
  'premium_12m',
]);

function isTestProductCode(code: string): boolean {
  if (REAL_PRODUCT_CODES.has(code)) return false;
  if (code.startsWith('stars_') && code.includes('_p1m')) return true;
  if (/^test_\d+_[a-z0-9]+_premium_1m$/.test(code)) return true;
  return false;
}

function isTestUsername(username: string | null | undefined): boolean {
  if (!username) return false;
  return (
    /^stars_\d+_[a-z0-9]+_u(_|$)/.test(username) ||
    /^test_\d+_[a-z0-9]+_user$/.test(username)
  );
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  const products = await prisma.product.findMany({
    where: {
      OR: [
        { code: { startsWith: 'stars_' } },
        { code: { startsWith: 'test_' } },
      ],
    },
    select: { id: true, code: true, planId: true },
    orderBy: { code: 'asc' },
  });

  const candidates = products.filter((p) => isTestProductCode(p.code));
  let removed = 0;

  for (const product of candidates) {
    const payments = await prisma.payment.findMany({
      where: { productId: product.id },
      select: { id: true, user: { select: { username: true } } },
    });

    const realPayments = payments.filter(
      (pay) => !isTestUsername(pay.user.username),
    );
    if (realPayments.length > 0) {
      console.error('[cleanup-test-products] blocked', {
        code: product.code,
        realPaymentCount: realPayments.length,
      });
      process.exitCode = 1;
      continue;
    }

    const paymentIds = payments.map((p) => p.id);

    if (dryRun) {
      console.log('[cleanup-test-products] dry-run would delete', {
        code: product.code,
        paymentCount: payments.length,
      });
      removed += 1;
      continue;
    }

    await prisma.entitlement.deleteMany({ where: { productId: product.id } });
    if (paymentIds.length > 0) {
      await prisma.monetizationEvent.deleteMany({
        where: { aggregateId: { in: paymentIds } },
      });
      await prisma.payment.deleteMany({ where: { productId: product.id } });
    }
    await prisma.productProviderPrice.deleteMany({
      where: { productId: product.id },
    });
    await prisma.product.delete({ where: { id: product.id } });

    console.log('[cleanup-test-products] removed', {
      code: product.code,
      paymentCount: payments.length,
    });
    removed += 1;
  }

  if (!dryRun) {
    const orphanPlans = await prisma.plan.findMany({
      where: {
        OR: [
          { code: { startsWith: 'stars_' } },
          { code: { startsWith: 'test_' } },
        ],
        products: { none: {} },
      },
      select: { id: true, code: true },
    });
    for (const plan of orphanPlans) {
      await prisma.plan.delete({ where: { id: plan.id } });
      console.log('[cleanup-test-products] removed orphan plan', { code: plan.code });
    }
  }

  console.log('[cleanup-test-products] done', { removed, dryRun });
}

main()
  .catch((e) => {
    console.error('[cleanup-test-products] failed', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
