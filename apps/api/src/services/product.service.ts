import type { EntitlementType, ProductDTO, ProductType } from '@98plus/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

type ProductWithPrices = Prisma.ProductGetPayload<{ include: { prices: true } }>;

function mapProduct(product: ProductWithPrices): ProductDTO {
  const storedMetadata =
    (product.metadata as Record<string, unknown> | null) ?? {};
  const metadata: Record<string, unknown> = { ...storedMetadata };
  // Premium UI reads badge from metadata — mirror the catalog field for compat.
  if (product.badge) {
    metadata.badge = product.badge;
  }

  return {
    code: product.code,
    title: product.title,
    description: product.description,
    type: product.type,
    isActive: product.isActive,
    isDefault: product.isDefault,
    entitlementType: product.entitlementType,
    entitlementDurationDays: product.entitlementDurationDays,
    metadata: Object.keys(metadata).length > 0 ? metadata : null,
    prices: product.prices
      .filter((p) => p.isActive)
      .map((p) => ({
        provider: p.provider,
        amount: p.amount,
        currency: p.currency,
        externalProductId: p.externalProductId,
        isActive: p.isActive,
      })),
  };
}

export interface ListProductsFilter {
  type?: ProductType;
  entitlementType?: EntitlementType;
}

/** Active, visible products (optionally filtered) with their active prices. */
export async function listActiveProducts(
  filter?: ListProductsFilter,
): Promise<ProductDTO[]> {
  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      isVisible: true,
      ...(filter?.type ? { type: filter.type } : {}),
      ...(filter?.entitlementType
        ? { entitlementType: filter.entitlementType }
        : {}),
    },
    include: { prices: true },
    orderBy: [{ displayOrder: 'asc' }, { entitlementDurationDays: 'asc' }],
  });
  return products.map(mapProduct);
}

/** Fetch a single active product row (with prices) by its stable code. */
export async function getActiveProductByCode(code: string) {
  return prisma.product.findFirst({
    where: { code, isActive: true, isVisible: true },
    include: { prices: true },
  });
}
