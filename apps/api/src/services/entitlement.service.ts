import type {
  EntitlementDTO,
  EntitlementsSummary,
  EntitlementType,
} from '@98plus/shared';
import type { Entitlement, Product } from '@prisma/client';
import { prisma } from '../lib/prisma';

function isActiveNow(entitlement: Entitlement, now: Date): boolean {
  if (entitlement.status !== 'ACTIVE') return false;
  if (entitlement.revokedAt) return false;
  if (entitlement.expiresAt && entitlement.expiresAt.getTime() <= now.getTime()) {
    return false;
  }
  return true;
}

function mapEntitlement(
  entitlement: Entitlement & { product?: Product | null },
): EntitlementDTO {
  return {
    type: entitlement.type,
    status: entitlement.status,
    productCode: entitlement.product?.code ?? null,
    startsAt: entitlement.startsAt.toISOString(),
    expiresAt: entitlement.expiresAt ? entitlement.expiresAt.toISOString() : null,
  };
}

/**
 * The single authoritative check for access. Premium is active iff there is an
 * ACTIVE, non-revoked, non-expired Entitlement of the given type. Payments are
 * never consulted here.
 */
export async function getActiveEntitlement(
  userId: string,
  type: EntitlementType,
): Promise<EntitlementDTO | null> {
  const now = new Date();
  const candidates = await prisma.entitlement.findMany({
    where: { userId, type, status: 'ACTIVE' },
    include: { product: true },
    orderBy: { startsAt: 'desc' },
  });
  const active = candidates.find((e) => isActiveNow(e, now));
  return active ? mapEntitlement(active) : null;
}

export async function getEntitlementsSummary(
  userId: string,
): Promise<EntitlementsSummary> {
  const activePremium = await getActiveEntitlement(userId, 'PREMIUM');
  return {
    premiumActive: Boolean(activePremium),
    activePremium,
  };
}

/**
 * Grant an entitlement from a SUCCEEDED payment. Server-only, idempotent.
 *
 * NOTE (phase 1): this is intentionally NOT invoked by the technical payment
 * intent flow, because no provider has confirmed a real payment yet. It exists
 * so provider webhooks can call it once real confirmation lands.
 *
 * Idempotency: `Entitlement.sourcePaymentId` is unique, so a repeated
 * confirmation of the same payment cannot create a second access grant.
 */
export async function grantEntitlementFromPayment(
  paymentId: string,
): Promise<EntitlementDTO> {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      include: { product: true },
    });
    if (!payment) {
      throw new Error('Payment not found');
    }
    if (payment.status !== 'SUCCEEDED') {
      throw new Error('Cannot grant entitlement for a non-succeeded payment');
    }

    // Idempotent: one entitlement per confirmed payment.
    const existing = await tx.entitlement.findUnique({
      where: { sourcePaymentId: payment.id },
      include: { product: true },
    });
    if (existing) {
      return mapEntitlement(existing);
    }

    const product = payment.product;
    const entitlementType = product.entitlementType ?? 'PREMIUM';
    const startsAt = new Date();
    const expiresAt = product.entitlementDurationDays
      ? new Date(
          startsAt.getTime() +
            product.entitlementDurationDays * 24 * 60 * 60 * 1000,
        )
      : null;

    const created = await tx.entitlement.create({
      data: {
        userId: payment.userId,
        productId: payment.productId,
        sourcePaymentId: payment.id,
        type: entitlementType,
        origin: 'PURCHASE',
        status: 'ACTIVE',
        startsAt,
        expiresAt,
      },
      include: { product: true },
    });
    return mapEntitlement(created);
  });
}
