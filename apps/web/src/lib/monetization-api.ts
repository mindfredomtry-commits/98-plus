import type {
  EntitlementsSummary,
  PaymentClientContext,
  PaymentIntentResult,
  PaymentProvider,
  PaymentProviderOption,
  ProductDTO,
} from '@98plus/shared';
import { api } from './api';

export function fetchPremiumProducts(
  token: string | null | undefined,
): Promise<ProductDTO[]> {
  return api<{ products: ProductDTO[] }>('/products?type=premium', {
    token,
  }).then((r) => r.products ?? []);
}

export function fetchEntitlementsSummary(
  token: string | null | undefined,
): Promise<EntitlementsSummary> {
  return api<EntitlementsSummary>('/me/entitlements', { token });
}

export function fetchPaymentProviders(
  token: string | null | undefined,
  context: PaymentClientContext,
): Promise<PaymentProviderOption[]> {
  return api<{ providers: PaymentProviderOption[] }>(
    `/payment-providers?context=${context}`,
    { token },
  ).then((r) => r.providers ?? []);
}

export function createPaymentIntent(
  token: string | null | undefined,
  body: {
    productCode: string;
    provider: PaymentProvider;
    idempotencyKey: string;
  },
): Promise<PaymentIntentResult> {
  return api<PaymentIntentResult>('/payments/intents', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
    retries: 0,
  });
}

/** Stable idempotency key for a payment intent attempt. */
export function newIdempotencyKey(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return `pi_${crypto.randomUUID()}`;
    }
  } catch {
    // fall through
  }
  return `pi_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
