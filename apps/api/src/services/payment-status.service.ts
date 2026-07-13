import type { PaymentStatus } from '@98plus/shared';
import { prisma } from '../lib/prisma';

/**
 * Expire stale payment intents. A payment is stale when it is still
 * CREATED/PENDING and its own `expiresAt` (the single source of intent TTL,
 * set at intent creation) is in the past. SUCCEEDED / FAILED / CANCELLED /
 * REFUNDED / already-EXPIRED payments are never touched. Payments without an
 * `expiresAt` (no TTL) are left alone — no second time source is introduced.
 */
export async function expireStalePayments(now: Date = new Date()): Promise<number> {
  const result = await prisma.payment.updateMany({
    where: {
      status: { in: ['CREATED', 'PENDING'] },
      expiresAt: { not: null, lte: now },
    },
    data: {
      status: 'EXPIRED',
      failureReason: 'intent expired before completion',
    },
  });
  return result.count;
}

export interface PaymentStatusForOwner {
  paymentId: string;
  status: PaymentStatus;
  provider: string;
  entitlementActive: boolean;
  entitlementExpiresAt: string | null;
  /** Payment SUCCEEDED but entitlement not active yet (outbox retry). */
  activationPending: boolean;
}

export async function getPaymentStatusForOwner(
  paymentId: string,
  userId: string,
): Promise<PaymentStatusForOwner | null> {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, userId },
    include: {
      entitlement: true,
      product: true,
    },
  });

  if (!payment) return null;

  const now = new Date();
  const entitlement = payment.entitlement;
  const entitlementActive =
    entitlement?.status === 'ACTIVE' &&
    !entitlement.revokedAt &&
    (!entitlement.expiresAt || entitlement.expiresAt > now);

  const activationPending =
    payment.status === 'SUCCEEDED' && !entitlementActive;

  return {
    paymentId: payment.id,
    status: payment.status,
    provider: payment.provider,
    entitlementActive,
    entitlementExpiresAt: entitlement?.expiresAt
      ? entitlement.expiresAt.toISOString()
      : null,
    activationPending,
  };
}
