import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const REAL_PRODUCT_CODES = new Set([
  'premium_1m',
  'premium_3m',
  'premium_6m',
  'premium_12m',
]);

/** Products created by integration tests (stars_* / test_* prefixes). */
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
  const products = await prisma.product.findMany({
    where: {
      OR: [
        { code: { startsWith: 'stars_' } },
        { code: { startsWith: 'test_' } },
      ],
    },
    select: {
      id: true,
      code: true,
      isActive: true,
      isVisible: true,
      _count: {
        select: {
          prices: true,
          payments: true,
          entitlements: true,
        },
      },
    },
    orderBy: { code: 'asc' },
  });

  const candidates = products.filter((p) => isTestProductCode(p.code));

  console.log('[audit-test-products] candidates', candidates.length);

  for (const p of candidates) {
    const payments = await prisma.payment.findMany({
      where: { productId: p.id },
      select: {
        id: true,
        user: { select: { username: true, firstName: true } },
      },
    });

    const realPayments = payments.filter(
      (pay) => !isTestUsername(pay.user.username),
    );

    console.log('[audit-test-products] product', {
      code: p.code,
      isActive: p.isActive,
      isVisible: p.isVisible,
      priceCount: p._count.prices,
      paymentCount: p._count.payments,
      entitlementCount: p._count.entitlements,
      realPaymentCount: realPayments.length,
      safeToDelete: realPayments.length === 0,
    });

    if (realPayments.length > 0) {
      console.error('[audit-test-products] blocked — real user payments on test product', {
        code: p.code,
        realPaymentCount: realPayments.length,
      });
      process.exitCode = 1;
    }
  }
}

main()
  .catch((e) => {
    console.error('[audit-test-products] failed', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
