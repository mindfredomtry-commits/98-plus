import type { PaymentStatusDTO } from '@98plus/shared';
import { api } from './api';

export function fetchPaymentStatus(
  token: string | null | undefined,
  paymentId: string,
): Promise<PaymentStatusDTO> {
  return api<PaymentStatusDTO>(`/payments/${encodeURIComponent(paymentId)}/status`, {
    token,
  });
}

export type PaymentPollResult =
  | { kind: 'activated'; expiresAt: string | null }
  | { kind: 'pending' }
  | { kind: 'failed'; message: string };

const DEFAULT_POLL_ATTEMPTS = 8;
const DEFAULT_POLL_INTERVAL_MS = 1500;

/** Limited polling after invoice close — server is source of truth. */
export async function pollPaymentActivation(
  token: string | null | undefined,
  paymentId: string,
  options?: { maxAttempts?: number; intervalMs?: number },
): Promise<PaymentPollResult> {
  const maxAttempts = options?.maxAttempts ?? DEFAULT_POLL_ATTEMPTS;
  const intervalMs = options?.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const status = await fetchPaymentStatus(token, paymentId);
      if (status.entitlementActive) {
        return { kind: 'activated', expiresAt: status.entitlementExpiresAt };
      }
      if (
        status.status === 'FAILED' ||
        status.status === 'CANCELLED' ||
        status.status === 'EXPIRED'
      ) {
        return { kind: 'failed', message: 'оплата не завершена' };
      }
      if (status.status === 'SUCCEEDED' && status.activationPending) {
        if (attempt < maxAttempts - 1) {
          await sleep(intervalMs);
          continue;
        }
        return { kind: 'pending' };
      }
      if (status.status === 'SUCCEEDED' && !status.activationPending) {
        return { kind: 'activated', expiresAt: status.entitlementExpiresAt };
      }
    } catch {
      // retry on transient errors
    }
    if (attempt < maxAttempts - 1) {
      await sleep(intervalMs);
    }
  }
  return { kind: 'pending' };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
