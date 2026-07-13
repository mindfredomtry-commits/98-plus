/** Internal monetization domain event types (DB outbox). */
export const MONETIZATION_EVENT_TYPES = [
  'PAYMENT_CONFIRMED',
  'PAYMENT_REFUNDED',
] as const;

export type MonetizationEventType = (typeof MONETIZATION_EVENT_TYPES)[number];

export const MONETIZATION_EVENT_STATUSES = [
  'PENDING',
  'PROCESSING',
  'PROCESSED',
  'FAILED',
] as const;

export type MonetizationEventStatus =
  (typeof MONETIZATION_EVENT_STATUSES)[number];

export const MONETIZATION_AGGREGATE_PAYMENT = 'PAYMENT' as const;

/** Stable idempotency key for a confirmed payment event. */
export function paymentConfirmedEventKey(paymentId: string): string {
  return `payment-confirmed:${paymentId}`;
}

/** Max handler attempts before the event is marked FAILED. */
export const MONETIZATION_EVENT_MAX_ATTEMPTS = 5;

/** Base retry delay (ms); multiplied by attempt count for backoff. */
export const MONETIZATION_EVENT_RETRY_DELAY_MS = 30_000;

/** PROCESSING events older than this are reclaimed as PENDING. */
export const MONETIZATION_EVENT_PROCESSING_TIMEOUT_MS = 5 * 60_000;

/** Default batch size for pending-event sweeps. */
export const MONETIZATION_EVENT_BATCH_LIMIT = 25;
