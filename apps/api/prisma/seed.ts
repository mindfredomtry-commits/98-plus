import { PrismaClient } from '@prisma/client';
import { PREMIUM_PLAN, PREMIUM_PRODUCTS } from '../src/config/monetization';

const prisma = new PrismaClient();

/**
 * Idempotent monetization seed. Safe to run repeatedly — plans, products and their
 * per-provider prices are upserted by their stable keys, so no duplicates are
 * created. Prices are the technical placeholders from config/monetization.ts.
 */
async function main() {
  const plan = await prisma.plan.upsert({
    where: { code: PREMIUM_PLAN.code },
    update: {
      title: PREMIUM_PLAN.title,
      description: PREMIUM_PLAN.description,
      displayOrder: PREMIUM_PLAN.displayOrder,
      isVisible: PREMIUM_PLAN.isVisible,
    },
    create: {
      code: PREMIUM_PLAN.code,
      title: PREMIUM_PLAN.title,
      description: PREMIUM_PLAN.description,
      displayOrder: PREMIUM_PLAN.displayOrder,
      isVisible: PREMIUM_PLAN.isVisible,
    },
  });

  console.log(`[seed] upserted plan ${plan.code}`);

  for (const def of PREMIUM_PRODUCTS) {
    const product = await prisma.product.upsert({
      where: { code: def.code },
      update: {
        planId: plan.id,
        title: def.title,
        description: def.description,
        type: def.type,
        isActive: true,
        isDefault: def.isDefault,
        isVisible: def.isVisible,
        displayOrder: def.displayOrder,
        badge: def.badge,
        recommended: def.recommended,
        entitlementType: def.entitlementType,
        entitlementDurationDays: def.entitlementDurationDays,
      },
      create: {
        code: def.code,
        planId: plan.id,
        title: def.title,
        description: def.description,
        type: def.type,
        isActive: true,
        isDefault: def.isDefault,
        isVisible: def.isVisible,
        displayOrder: def.displayOrder,
        badge: def.badge,
        recommended: def.recommended,
        entitlementType: def.entitlementType,
        entitlementDurationDays: def.entitlementDurationDays,
      },
    });

    for (const price of def.prices) {
      await prisma.productProviderPrice.upsert({
        where: {
          productId_provider: {
            productId: product.id,
            provider: price.provider,
          },
        },
        update: {
          amount: price.amount,
          currency: price.currency,
          isActive: price.isActive,
        },
        create: {
          productId: product.id,
          provider: price.provider,
          amount: price.amount,
          currency: price.currency,
          isActive: price.isActive,
        },
      });
    }

    console.log(`[seed] upserted product ${def.code} (${def.prices.length} prices)`);
  }
}

main()
  .then(() => console.log('[seed] monetization seed complete'))
  .catch((err) => {
    console.error('[seed] failed', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
