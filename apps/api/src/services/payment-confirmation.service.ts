import type { PaymentProvider } from '@98plus/shared';
import type { Prisma } from '@prisma/client';
import {
  MONETIZATION_AGGREGATE_PAYMENT,
  paymentConfirmedEventKey,
} from '../config/monetization-events';
import { prisma } from '../lib/prisma';
import { monetizationLog } from './monetization-logger';
import {
  processEvent,
  type ProcessEventResult,
} from './monetization-event-processor';
import {
  assertPaymentConfirmable,
  ProviderConfirmationValidationError,
  type WebhookAmountCheck,
} from './payment-provider-validation';

const TERMINAL_PAYMENT_STATUSES = new Set([
  'FAILED',
  'CANCELLED',
  'REFUNDED',
  'EXPIRED',
]);

export class PaymentConfirmationError extends Error {
  constructor(
    message: string,
    public status: number = 400,
  ) {
    super(message);
    this.name = 'PaymentConfirmationError';
  }
}

export interface ConfirmPaymentFromProviderInput {
  paymentId: string;
  provider: PaymentProvider;
  externalPaymentId: string;
  safeProviderPayload?: Record<string, unknown>;
  confirmedAt?: Date;
  /** Optional webhook fields — validated against server Payment when present. */
  webhookAmountCheck?: WebhookAmountCheck;
}

export interface ConfirmPaymentFromProviderResult {
  paymentId: string;
  status: 'SUCCEEDED';
  eventId: string | null;
  alreadyConfirmed: boolean;
  eventProcessing: ProcessEventResult | null;
}

function buildSafePayload(input: {
  paymentId: string;
  provider: PaymentProvider;
  productCode: string;
  userId: string;
  externalPaymentId: string;
}): Prisma.InputJsonValue {
  return {
    paymentId: input.paymentId,
    provider: input.provider,
    productCode: input.productCode,
    userId: input.userId,
    externalPaymentId: input.externalPaymentId,
  };
}

/**
 * Single server entry point for provider-confirmed payments.
 * Marks Payment SUCCEEDED + enqueues PAYMENT_CONFIRMED outbox event.
 * Entitlement is granted asynchronously by the event processor.
 */
export async function confirmPaymentFromProvider(
  input: ConfirmPaymentFromProviderInput,
): Promise<ConfirmPaymentFromProviderResult> {
  const {
    paymentId,
    provider,
    externalPaymentId,
    safeProviderPayload,
    confirmedAt = new Date(),
    webhookAmountCheck,
  } = input;

  monetizationLog.paymentConfirmStarted({ paymentId, provider });

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { product: { include: { plan: true } } },
  });

  if (!payment) {
    throw new PaymentConfirmationError('Payment not found', 404);
  }

  if (payment.provider !== provider) {
    throw new PaymentConfirmationError('Provider mismatch', 400);
  }

  const serverPrice = await prisma.productProviderPrice.findUnique({
    where: {
      productId_provider: {
        productId: payment.productId,
        provider,
      },
    },
  });

  if (payment.status === 'SUCCEEDED') {
    const existingEvent = await prisma.monetizationEvent.findUnique({
      where: { idempotencyKey: paymentConfirmedEventKey(paymentId) },
    });
    monetizationLog.paymentConfirmIdempotent({
      paymentId,
      provider,
      eventId: existingEvent?.id,
      status: payment.status,
    });
    return {
      paymentId,
      status: 'SUCCEEDED',
      eventId: existingEvent?.id ?? null,
      alreadyConfirmed: true,
      eventProcessing: null,
    };
  }

  if (TERMINAL_PAYMENT_STATUSES.has(payment.status)) {
    throw new PaymentConfirmationError(
      `Cannot confirm payment in status ${payment.status}`,
      409,
    );
  }

  // Authoritative re-validation at confirm time. Catches anything changed
  // between pre_checkout and successful_payment (product/plan/price disabled,
  // intent expired, status/amount/currency drift). Never trusts the client.
  try {
    assertPaymentConfirmable({
      payment,
      product: payment.product,
      plan: payment.product.plan,
      serverPrice,
      provider,
      webhook: webhookAmountCheck,
      now: confirmedAt,
    });
  } catch (err) {
    if (err instanceof ProviderConfirmationValidationError) {
      throw new PaymentConfirmationError(err.message, 409);
    }
    throw err;
  }

  const chargeConflict = await prisma.payment.findFirst({
    where: {
      provider,
      externalPaymentId,
      NOT: { id: paymentId },
    },
  });
  if (chargeConflict) {
    throw new PaymentConfirmationError(
      'Charge ID already linked to another payment',
      409,
    );
  }

  const eventIdempotencyKey = paymentConfirmedEventKey(paymentId);
  const payload = buildSafePayload({
    paymentId,
    provider,
    productCode: payment.product.code,
    userId: payment.userId,
    externalPaymentId,
  });

  const mergedPayload: Prisma.InputJsonValue = safeProviderPayload
    ? ({
        ...(payload as object),
        providerMeta: safeProviderPayload as Prisma.InputJsonValue,
      } as Prisma.InputJsonValue)
    : payload;

  const { eventId } = await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: 'SUCCEEDED',
        confirmedAt,
        externalPaymentId,
        providerPayload: mergedPayload,
      },
    });

    const event = await tx.monetizationEvent.create({
      data: {
        type: 'PAYMENT_CONFIRMED',
        aggregateType: MONETIZATION_AGGREGATE_PAYMENT,
        aggregateId: paymentId,
        idempotencyKey: eventIdempotencyKey,
        payload: mergedPayload,
        status: 'PENDING',
      },
    });

    return { eventId: event.id };
  });

  monetizationLog.paymentConfirmSucceeded({
    paymentId,
    provider,
    eventId,
    productCode: payment.product.code,
    status: 'SUCCEEDED',
  });

  let eventProcessing: ProcessEventResult | null = null;
  try {
    eventProcessing = await processEvent(eventId);
  } catch (e) {
    console.error('[monetization] sync processEvent failed', {
      paymentId,
      eventId,
      error: e instanceof Error ? e.message : 'unknown',
    });
  }

  return {
    paymentId,
    status: 'SUCCEEDED',
    eventId,
    alreadyConfirmed: false,
    eventProcessing,
  };
}
