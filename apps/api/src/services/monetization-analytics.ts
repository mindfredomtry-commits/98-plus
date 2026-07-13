import { trackEvent } from './analytics.service';

export const MONETIZATION_ANALYTICS_EVENTS = {
  PREMIUM_ACTIVATED: 'premium_activated',
} as const;

export interface PremiumActivatedFields {
  userId: string;
  productCode: string;
  provider: string;
  entitlementType: string;
  durationDays: number | null;
  paymentId: string;
}

/**
 * Server-side monetization analytics hook. Safe no-op when tracking fails.
 * Never receives providerPayload, externalPaymentId, or PII.
 */
export async function trackMonetizationEvent(
  name: string,
  fields: PremiumActivatedFields,
): Promise<void> {
  try {
    await trackEvent(name, fields.userId, {
      productCode: fields.productCode,
      provider: fields.provider,
      entitlementType: fields.entitlementType,
      durationDays: fields.durationDays,
      paymentId: fields.paymentId,
    });
  } catch (e) {
    console.error('[monetization-analytics]', name, e);
  }
}
