import type { MonetizationEvent } from '@prisma/client';
import {
  MONETIZATION_EVENT_BATCH_LIMIT,
  MONETIZATION_EVENT_MAX_ATTEMPTS,
  MONETIZATION_EVENT_PROCESSING_TIMEOUT_MS,
  MONETIZATION_EVENT_RETRY_DELAY_MS,
} from '../config/monetization-events';
import { prisma } from '../lib/prisma';
import {
  MONETIZATION_ANALYTICS_EVENTS,
  trackMonetizationEvent,
} from './monetization-analytics';
import { grantEntitlementFromPayment } from './entitlement.service';
import { monetizationLog } from './monetization-logger';

export type ProcessEventOutcome = 'processed' | 'skipped' | 'failed' | 'retry';

export interface ProcessEventResult {
  eventId: string;
  outcome: ProcessEventOutcome;
}

export interface ProcessPendingEventsResult {
  processed: number;
  failed: number;
  skipped: number;
  retry: number;
}

export interface EventProcessorDeps {
  grantEntitlement?: typeof grantEntitlementFromPayment;
  trackMonetization?: typeof trackMonetizationEvent;
}

const defaultDeps: Required<EventProcessorDeps> = {
  grantEntitlement: grantEntitlementFromPayment,
  trackMonetization: trackMonetizationEvent,
};

function truncateError(message: string, max = 500): string {
  return message.length > max ? `${message.slice(0, max)}…` : message;
}

function retryDelayMs(attempt: number): number {
  return MONETIZATION_EVENT_RETRY_DELAY_MS * Math.max(1, attempt);
}

/** Reclaim events stuck in PROCESSING after a worker crash. */
export async function recoverStuckProcessingEvents(): Promise<number> {
  const threshold = new Date(
    Date.now() - MONETIZATION_EVENT_PROCESSING_TIMEOUT_MS,
  );
  const result = await prisma.monetizationEvent.updateMany({
    where: {
      status: 'PROCESSING',
      OR: [
        { processingStartedAt: { lt: threshold } },
        { processingStartedAt: null, updatedAt: { lt: threshold } },
      ],
    },
    data: {
      status: 'PENDING',
      availableAt: new Date(),
      processingStartedAt: null,
      lastError: 'processing timeout — reclaimed',
    },
  });
  return result.count;
}

async function claimEvent(eventId: string): Promise<MonetizationEvent | null> {
  const now = new Date();
  const claimed = await prisma.monetizationEvent.updateMany({
    where: {
      id: eventId,
      status: 'PENDING',
      availableAt: { lte: now },
    },
    data: {
      status: 'PROCESSING',
      processingStartedAt: now,
    },
  });

  if (claimed.count === 0) {
    return null;
  }

  return prisma.monetizationEvent.findUnique({ where: { id: eventId } });
}

interface PaymentConfirmedPayload {
  paymentId: string;
  provider: string;
  productCode: string;
  userId: string;
}

function parsePaymentConfirmedPayload(
  event: MonetizationEvent,
): PaymentConfirmedPayload {
  const raw = event.payload as Record<string, unknown>;
  const paymentId = raw.paymentId;
  const provider = raw.provider;
  const productCode = raw.productCode;
  const userId = raw.userId;
  if (
    typeof paymentId !== 'string' ||
    typeof provider !== 'string' ||
    typeof productCode !== 'string' ||
    typeof userId !== 'string'
  ) {
    throw new Error('Invalid PAYMENT_CONFIRMED payload');
  }
  return { paymentId, provider, productCode, userId };
}

async function handlePaymentConfirmed(
  event: MonetizationEvent,
  deps: Required<EventProcessorDeps>,
): Promise<void> {
  const { paymentId, provider, productCode, userId } =
    parsePaymentConfirmedPayload(event);

  const entitlement = await deps.grantEntitlement(paymentId);

  monetizationLog.entitlementGranted({
    paymentId,
    eventId: event.id,
    provider,
    productCode,
    status: entitlement.status,
  });

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { product: true },
  });

  try {
    await deps.trackMonetization(
      MONETIZATION_ANALYTICS_EVENTS.PREMIUM_ACTIVATED,
      {
        userId,
        productCode,
        provider,
        entitlementType: entitlement.type,
        durationDays: payment?.product.entitlementDurationDays ?? null,
        paymentId,
      },
    );
  } catch (e) {
    console.error('[monetization] analytics hook failed', {
      paymentId,
      eventId: event.id,
      error: e instanceof Error ? e.message : 'unknown',
    });
  }
}

async function markEventProcessed(eventId: string): Promise<void> {
  await prisma.monetizationEvent.update({
    where: { id: eventId },
    data: {
      status: 'PROCESSED',
      processedAt: new Date(),
      lastError: null,
      processingStartedAt: null,
    },
  });
}

async function markEventFailed(
  event: MonetizationEvent,
  errorMessage: string,
): Promise<ProcessEventOutcome> {
  const nextAttempts = event.attempts + 1;
  const shortError = truncateError(errorMessage);

  if (nextAttempts >= MONETIZATION_EVENT_MAX_ATTEMPTS) {
    await prisma.monetizationEvent.update({
      where: { id: event.id },
      data: {
        status: 'FAILED',
        attempts: nextAttempts,
        lastError: shortError,
        processingStartedAt: null,
      },
    });
    monetizationLog.eventRetry({
      eventId: event.id,
      attempt: nextAttempts,
      status: 'FAILED',
    });
    return 'failed';
  }

  const availableAt = new Date(Date.now() + retryDelayMs(nextAttempts));
  await prisma.monetizationEvent.update({
    where: { id: event.id },
    data: {
      status: 'PENDING',
      attempts: nextAttempts,
      lastError: shortError,
      availableAt,
      processingStartedAt: null,
    },
  });
  monetizationLog.eventRetry({
    eventId: event.id,
    attempt: nextAttempts,
    status: 'PENDING',
  });
  return 'retry';
}

/**
 * Process a single outbox event. Safe to call concurrently — only one worker
 * wins the PENDING → PROCESSING claim.
 */
export async function processEvent(
  eventId: string,
  deps: EventProcessorDeps = {},
): Promise<ProcessEventResult> {
  const resolved = { ...defaultDeps, ...deps };
  const existing = await prisma.monetizationEvent.findUnique({
    where: { id: eventId },
  });

  if (!existing) {
    return { eventId, outcome: 'skipped' };
  }

  if (existing.status === 'PROCESSED') {
    return { eventId, outcome: 'skipped' };
  }

  if (existing.status === 'FAILED') {
    return { eventId, outcome: 'skipped' };
  }

  const event = await claimEvent(eventId);
  if (!event) {
    const current = await prisma.monetizationEvent.findUnique({
      where: { id: eventId },
    });
    if (current?.status === 'PROCESSED') {
      return { eventId, outcome: 'skipped' };
    }
    return { eventId, outcome: 'skipped' };
  }

  monetizationLog.eventClaimed({
    eventId: event.id,
    attempt: event.attempts,
    status: event.status,
  });

  try {
    switch (event.type) {
      case 'PAYMENT_CONFIRMED':
        await handlePaymentConfirmed(event, resolved);
        break;
      case 'PAYMENT_REFUNDED':
        // TODO: revoke or adjust Entitlement when refund flow is implemented.
        break;
      default:
        throw new Error(`Unsupported event type: ${event.type}`);
    }

    await markEventProcessed(event.id);
    monetizationLog.eventProcessed({
      eventId: event.id,
      status: 'PROCESSED',
    });
    return { eventId, outcome: 'processed' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown handler error';
    const outcome = await markEventFailed(event, message);
    return { eventId, outcome };
  }
}

/** Sweep pending (and recovered) events — used by cron and internal endpoint. */
export async function processPendingEvents(
  limit = MONETIZATION_EVENT_BATCH_LIMIT,
  deps: EventProcessorDeps = {},
): Promise<ProcessPendingEventsResult> {
  await recoverStuckProcessingEvents();

  const now = new Date();
  const pending = await prisma.monetizationEvent.findMany({
    where: {
      status: 'PENDING',
      availableAt: { lte: now },
    },
    orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }],
    take: limit,
  });

  const totals: ProcessPendingEventsResult = {
    processed: 0,
    failed: 0,
    skipped: 0,
    retry: 0,
  };

  for (const row of pending) {
    const result = await processEvent(row.id, deps);
    switch (result.outcome) {
      case 'processed':
        totals.processed += 1;
        break;
      case 'failed':
        totals.failed += 1;
        break;
      case 'retry':
        totals.retry += 1;
        break;
      default:
        totals.skipped += 1;
    }
  }

  return totals;
}

/** Exported alias for cron / Railway entry points. */
export const processPendingMonetizationEvents = processPendingEvents;
