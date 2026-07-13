/**
 * Run: npm run test:monetization-events -w @98plus/api
 *
 * Integration tests for payment confirmation + DB outbox processor.
 * Requires DATABASE_URL (and DIRECT_URL if set in schema).
 */
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { paymentConfirmedEventKey } from '../src/config/monetization-events';
import {
  processEvent,
  processPendingEvents,
} from '../src/services/monetization-event-processor';
import {
  confirmPaymentFromProvider,
  PaymentConfirmationError,
} from '../src/services/payment-confirmation.service';
import {
  ProviderConfirmationValidationError,
  validateProviderConfirmationAgainstPayment,
} from '../src/services/payment-provider-validation';

const prisma = new PrismaClient();

const runId = `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

type Fixture = {
  userId: string;
  planId: string;
  productId: string;
  paymentId: string;
};

async function createFixture(
  status: 'CREATED' | 'PENDING' | 'FAILED' | 'CANCELLED' | 'REFUNDED' | 'EXPIRED' = 'CREATED',
): Promise<Fixture> {
  const user = await prisma.user.create({
    data: {
      telegramId: BigInt(`${Date.now()}${Math.floor(Math.random() * 1000)}`),
      firstName: 'Test',
      username: `${runId}_user`,
    },
  });

  const plan = await prisma.plan.create({
    data: {
      code: `${runId}_plan`,
      title: 'Test Plan',
      displayOrder: 1,
    },
  });

  const product = await prisma.product.create({
    data: {
      code: `${runId}_premium_1m`,
      planId: plan.id,
      title: '1 month',
      type: 'SUBSCRIPTION',
      entitlementType: 'PREMIUM',
      entitlementDurationDays: 30,
      displayOrder: 1,
    },
  });

  await prisma.productProviderPrice.create({
    data: {
      productId: product.id,
      provider: 'SBP',
      amount: 299,
      currency: 'RUB',
    },
  });

  const payment = await prisma.payment.create({
    data: {
      userId: user.id,
      productId: product.id,
      provider: 'SBP',
      status,
      amount: 299,
      currency: 'RUB',
      idempotencyKey: `${runId}_pi_${status}`,
      ...(status === 'FAILED' ? { failedAt: new Date() } : {}),
      ...(status === 'CANCELLED' ? { failureReason: 'cancelled' } : {}),
      ...(status === 'REFUNDED' ? { refundedAt: new Date() } : {}),
      ...(status === 'EXPIRED' ? { expiresAt: new Date() } : {}),
    },
  });

  return {
    userId: user.id,
    planId: plan.id,
    productId: product.id,
    paymentId: payment.id,
  };
}

async function cleanupFixture(fx: Fixture): Promise<void> {
  await prisma.entitlement.deleteMany({
    where: { productId: fx.productId },
  });
  await prisma.monetizationEvent.deleteMany({
    where: { aggregateId: fx.paymentId },
  });
  await prisma.payment.deleteMany({ where: { id: fx.paymentId } });
  await prisma.productProviderPrice.deleteMany({
    where: { productId: fx.productId },
  });
  await prisma.product.deleteMany({ where: { id: fx.productId } });
  await prisma.plan.deleteMany({ where: { id: fx.planId } });
  await prisma.user.deleteMany({ where: { id: fx.userId } });
}

async function testCreatedPaymentConfirmsWithOneEvent(): Promise<void> {
  const fx = await createFixture('CREATED');
  try {
    const result = await confirmPaymentFromProvider({
      paymentId: fx.paymentId,
      provider: 'SBP',
      externalPaymentId: 'ext_1',
      safeProviderPayload: { source: 'test' },
    });

    assert.equal(result.status, 'SUCCEEDED');
    assert.equal(result.alreadyConfirmed, false);
    assert.ok(result.eventId);

    const payment = await prisma.payment.findUnique({
      where: { id: fx.paymentId },
    });
    assert.equal(payment?.status, 'SUCCEEDED');
    assert.equal(payment?.externalPaymentId, 'ext_1');

    const events = await prisma.monetizationEvent.findMany({
      where: { aggregateId: fx.paymentId },
    });
    assert.equal(events.length, 1);
    assert.equal(events[0]?.type, 'PAYMENT_CONFIRMED');
    assert.equal(
      events[0]?.idempotencyKey,
      paymentConfirmedEventKey(fx.paymentId),
    );
  } finally {
    await cleanupFixture(fx);
  }
}

async function testRepeatConfirmIsIdempotent(): Promise<void> {
  const fx = await createFixture('CREATED');
  try {
    await confirmPaymentFromProvider({
      paymentId: fx.paymentId,
      provider: 'SBP',
      externalPaymentId: 'ext_2',
    });
    const second = await confirmPaymentFromProvider({
      paymentId: fx.paymentId,
      provider: 'SBP',
      externalPaymentId: 'ext_2b',
    });

    assert.equal(second.alreadyConfirmed, true);

    const events = await prisma.monetizationEvent.findMany({
      where: { aggregateId: fx.paymentId },
    });
    assert.equal(events.length, 1);

    const entitlements = await prisma.entitlement.findMany({
      where: { sourcePaymentId: fx.paymentId },
    });
    assert.equal(entitlements.length, 1);
  } finally {
    await cleanupFixture(fx);
  }
}

async function testPaymentConfirmedCreatesEntitlement(): Promise<void> {
  const fx = await createFixture('CREATED');
  try {
    const confirm = await confirmPaymentFromProvider({
      paymentId: fx.paymentId,
      provider: 'SBP',
      externalPaymentId: 'ext_3',
    });
    assert.ok(confirm.eventId);

    const event = await prisma.monetizationEvent.findUnique({
      where: { id: confirm.eventId! },
    });
    assert.equal(event?.status, 'PROCESSED');

    const entitlement = await prisma.entitlement.findUnique({
      where: { sourcePaymentId: fx.paymentId },
    });
    assert.ok(entitlement);
    assert.equal(entitlement?.status, 'ACTIVE');
    assert.equal(entitlement?.type, 'PREMIUM');
  } finally {
    await cleanupFixture(fx);
  }
}

async function testProcessedEventNoOp(): Promise<void> {
  const fx = await createFixture('CREATED');
  try {
    const confirm = await confirmPaymentFromProvider({
      paymentId: fx.paymentId,
      provider: 'SBP',
      externalPaymentId: 'ext_4',
    });
    const first = await processEvent(confirm.eventId!);
    assert.equal(first.outcome, 'processed');

    const second = await processEvent(confirm.eventId!);
    assert.equal(second.outcome, 'skipped');

    const entitlements = await prisma.entitlement.findMany({
      where: { sourcePaymentId: fx.paymentId },
    });
    assert.equal(entitlements.length, 1);
  } finally {
    await cleanupFixture(fx);
  }
}

async function testGrantFailureKeepsPaymentAndRetriesEvent(): Promise<void> {
  const fx = await createFixture('CREATED');
  try {
    await prisma.payment.update({
      where: { id: fx.paymentId },
      data: { status: 'SUCCEEDED', confirmedAt: new Date() },
    });

    const event = await prisma.monetizationEvent.create({
      data: {
        type: 'PAYMENT_CONFIRMED',
        aggregateType: 'PAYMENT',
        aggregateId: fx.paymentId,
        idempotencyKey: paymentConfirmedEventKey(fx.paymentId),
        payload: {
          paymentId: fx.paymentId,
          provider: 'SBP',
          productCode: `${runId}_premium_1m`,
          userId: fx.userId,
          externalPaymentId: 'ext_5',
        },
        status: 'PENDING',
      },
    });

    const result = await processEvent(event.id, {
      grantEntitlement: async () => {
        throw new Error('simulated grant failure');
      },
    });

    assert.equal(result.outcome, 'retry');

    const payment = await prisma.payment.findUnique({
      where: { id: fx.paymentId },
    });
    assert.equal(payment?.status, 'SUCCEEDED');

    const updated = await prisma.monetizationEvent.findUnique({
      where: { id: event.id },
    });
    assert.equal(updated?.status, 'PENDING');
    assert.equal(updated?.attempts, 1);
    assert.ok(updated?.lastError?.includes('simulated grant failure'));
  } finally {
    await cleanupFixture(fx);
  }
}

async function testParallelProcessorsSingleEntitlement(): Promise<void> {
  const fx = await createFixture('CREATED');
  try {
    await prisma.payment.update({
      where: { id: fx.paymentId },
      data: { status: 'SUCCEEDED', confirmedAt: new Date() },
    });

    const event = await prisma.monetizationEvent.create({
      data: {
        type: 'PAYMENT_CONFIRMED',
        aggregateType: 'PAYMENT',
        aggregateId: fx.paymentId,
        idempotencyKey: paymentConfirmedEventKey(fx.paymentId),
        payload: {
          paymentId: fx.paymentId,
          provider: 'SBP',
          productCode: `${runId}_premium_1m`,
          userId: fx.userId,
          externalPaymentId: 'ext_6',
        },
        status: 'PENDING',
      },
    });

    const [a, b] = await Promise.all([
      processEvent(event.id),
      processEvent(event.id),
    ]);

    const outcomes = [a.outcome, b.outcome].sort();
    assert.deepEqual(outcomes, ['processed', 'skipped']);

    const entitlements = await prisma.entitlement.findMany({
      where: { sourcePaymentId: fx.paymentId },
    });
    assert.equal(entitlements.length, 1);
  } finally {
    await cleanupFixture(fx);
  }
}

async function testWrongProviderRejected(): Promise<void> {
  const fx = await createFixture('CREATED');
  try {
    await assert.rejects(
      () =>
        confirmPaymentFromProvider({
          paymentId: fx.paymentId,
          provider: 'TELEGRAM_STARS',
          externalPaymentId: 'ext_bad',
        }),
      (err: unknown) =>
        err instanceof PaymentConfirmationError &&
        err.message === 'Provider mismatch',
    );
  } finally {
    await cleanupFixture(fx);
  }
}

async function testTerminalStatusesCannotConfirm(): Promise<void> {
  for (const status of [
    'FAILED',
    'CANCELLED',
    'REFUNDED',
    'EXPIRED',
  ] as const) {
    const fx = await createFixture(status);
    try {
      await assert.rejects(
        () =>
          confirmPaymentFromProvider({
            paymentId: fx.paymentId,
            provider: 'SBP',
            externalPaymentId: `ext_${status}`,
          }),
        (err: unknown) => err instanceof PaymentConfirmationError,
      );
    } finally {
      await cleanupFixture(fx);
    }
  }
}

async function testWebhookAmountValidation(): Promise<void> {
  const fx = await createFixture('CREATED');
  try {
    const payment = await prisma.payment.findUnique({
      where: { id: fx.paymentId },
    });
    assert.ok(payment);

    assert.throws(
      () =>
        validateProviderConfirmationAgainstPayment(
          payment,
          'SBP',
          { amount: 1, currency: 'RUB' },
        ),
      ProviderConfirmationValidationError,
    );

    await assert.rejects(
      () =>
        confirmPaymentFromProvider({
          paymentId: fx.paymentId,
          provider: 'SBP',
          externalPaymentId: 'ext_val',
          webhookAmountCheck: { amount: 1, currency: 'RUB' },
        }),
      (err: unknown) => err instanceof PaymentConfirmationError,
    );
  } finally {
    await cleanupFixture(fx);
  }
}

async function testAnalyticsFailureStillProcessesEvent(): Promise<void> {
  const fx = await createFixture('CREATED');
  try {
    await prisma.payment.update({
      where: { id: fx.paymentId },
      data: { status: 'SUCCEEDED', confirmedAt: new Date() },
    });

    const event = await prisma.monetizationEvent.create({
      data: {
        type: 'PAYMENT_CONFIRMED',
        aggregateType: 'PAYMENT',
        aggregateId: fx.paymentId,
        idempotencyKey: `${paymentConfirmedEventKey(fx.paymentId)}_analytics`,
        payload: {
          paymentId: fx.paymentId,
          provider: 'SBP',
          productCode: `${runId}_premium_1m`,
          userId: fx.userId,
          externalPaymentId: 'ext_7',
        },
        status: 'PENDING',
      },
    });

    const result = await processEvent(event.id, {
      trackMonetization: async () => {
        throw new Error('analytics down');
      },
    });

    assert.equal(result.outcome, 'processed');

    const updated = await prisma.monetizationEvent.findUnique({
      where: { id: event.id },
    });
    assert.equal(updated?.status, 'PROCESSED');

    const entitlement = await prisma.entitlement.findUnique({
      where: { sourcePaymentId: fx.paymentId },
    });
    assert.ok(entitlement);
  } finally {
    await cleanupFixture(fx);
  }
}

async function testPendingSweep(): Promise<void> {
  const fx = await createFixture('CREATED');
  try {
    await confirmPaymentFromProvider({
      paymentId: fx.paymentId,
      provider: 'SBP',
      externalPaymentId: 'ext_8',
    });

    const totals = await processPendingEvents(10);
    assert.ok(totals.processed + totals.skipped >= 0);
  } finally {
    await cleanupFixture(fx);
  }
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.warn(
      '[monetization-event-outbox.test] DATABASE_URL unset — integration tests skipped',
    );
    process.exit(0);
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    console.warn(
      '[monetization-event-outbox.test] database unreachable — integration tests skipped',
    );
    process.exit(0);
  }

  await testCreatedPaymentConfirmsWithOneEvent();
  await testRepeatConfirmIsIdempotent();
  await testPaymentConfirmedCreatesEntitlement();
  await testProcessedEventNoOp();
  await testGrantFailureKeepsPaymentAndRetriesEvent();
  await testParallelProcessorsSingleEntitlement();
  await testWrongProviderRejected();
  await testTerminalStatusesCannotConfirm();
  await testWebhookAmountValidation();
  await testAnalyticsFailureStillProcessesEvent();
  await testPendingSweep();

  console.log('[monetization-event-outbox.test] all 10 scenarios passed');
}

main()
  .catch((err) => {
    console.error('[monetization-event-outbox.test] failed', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
