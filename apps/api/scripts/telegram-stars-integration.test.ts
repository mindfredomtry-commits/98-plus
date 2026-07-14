/**
 * Run: npm run test:telegram-stars-integration -w @98plus/api
 * Requires DATABASE_URL.
 */
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import {
  buildTelegramStarsInvoicePayload,
  parseTelegramStarsInvoicePayload,
} from '../src/config/telegram-stars';
import { setTelegramApiFetchForTests } from '../src/lib/telegram-api';
import {
  handleStarsPreCheckoutQuery,
  handleStarsSuccessfulPayment,
  validateStarsPreCheckout,
  paymentIntentExpiresAt,
} from '../src/services/telegram-stars-payment.service';
import {
  confirmPaymentFromProvider,
  PaymentConfirmationError,
} from '../src/services/payment-confirmation.service';
import { createPaymentIntent } from '../src/services/payment.service';
import { getEntitlementsSummary } from '../src/services/entitlement.service';
import { expireStalePayments } from '../src/services/payment-status.service';
import {
  processPendingEvents,
} from '../src/services/monetization-event-processor';
import { paymentConfirmedEventKey } from '../src/config/monetization-events';

const prisma = new PrismaClient();
const runId = `stars_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

process.env.TELEGRAM_BOT_TOKEN = 'test-token';
process.env.TELEGRAM_STARS_ENABLED = 'true';

setTelegramApiFetchForTests(async (_url, init) => {
  const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
  if (body.pre_checkout_query_id) {
    return new Response(JSON.stringify({ ok: true, result: true }), {
      status: 200,
    });
  }
  if (body.title) {
    return new Response(
      JSON.stringify({ ok: true, result: 'https://t.me/$invoice_test' }),
      { status: 200 },
    );
  }
  return new Response(JSON.stringify({ ok: true, result: true }), {
    status: 200,
  });
});

type Fx = {
  userId: string;
  telegramId: bigint;
  productId: string;
  productCode: string;
  planId: string;
  paymentId: string;
};

async function createFx(): Promise<Fx> {
  const fxId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const telegramId = BigInt(`${Date.now()}${Math.floor(Math.random() * 999)}`);
  const user = await prisma.user.create({
    data: {
      telegramId,
      firstName: 'Stars',
      username: `${runId}_u_${fxId}`,
    },
  });
  const plan = await prisma.plan.create({
    data: { code: `${runId}_plan_${fxId}`, title: 'Premium' },
  });
  const productCode = `${runId}_p1m_${fxId}`;
  const product = await prisma.product.create({
    data: {
      code: productCode,
      planId: plan.id,
      title: '1 месяц',
      type: 'SUBSCRIPTION',
      entitlementType: 'PREMIUM',
      entitlementDurationDays: 30,
      isActive: true,
      isVisible: true,
    },
  });
  await prisma.productProviderPrice.create({
    data: {
      productId: product.id,
      provider: 'TELEGRAM_STARS',
      amount: 300,
      currency: 'XTR',
      isActive: true,
    },
  });
  const payment = await prisma.payment.create({
    data: {
      userId: user.id,
      productId: product.id,
      provider: 'TELEGRAM_STARS',
      status: 'PENDING',
      amount: 300,
      currency: 'XTR',
      idempotencyKey: `${runId}_${user.id}`,
      expiresAt: paymentIntentExpiresAt(),
    },
  });
  return {
    userId: user.id,
    telegramId,
    productId: product.id,
    productCode,
    planId: plan.id,
    paymentId: payment.id,
  };
}

async function cleanup(fx: Fx): Promise<void> {
  await prisma.entitlement.deleteMany({ where: { productId: fx.productId } });
  await prisma.monetizationEvent.deleteMany({
    where: { aggregateId: fx.paymentId },
  });
  await prisma.payment.deleteMany({ where: { userId: fx.userId } });
  await prisma.productProviderPrice.deleteMany({
    where: { productId: fx.productId },
  });
  await prisma.product.deleteMany({ where: { id: fx.productId } });
  await prisma.plan.deleteMany({ where: { id: fx.planId } });
  await prisma.user.deleteMany({ where: { id: fx.userId } });
}

async function testIntentUsesDbPrice(): Promise<void> {
  const fx = await createFx();
  try {
    const intent = await createPaymentIntent({
      userId: fx.userId,
      productCode: fx.productCode,
      provider: 'TELEGRAM_STARS',
      idempotencyKey: `${runId}_intent_${fx.userId}`,
    });
    assert.equal(intent.provider, 'TELEGRAM_STARS');
    assert.equal(intent.nextAction, 'OPEN_INVOICE');
    assert.ok(intent.invoiceUrl);
    const row = await prisma.payment.findUnique({
      where: { id: intent.paymentId },
    });
    assert.equal(row?.amount, 300);
    assert.equal(row?.currency, 'XTR');
  } finally {
    await cleanup(fx);
  }
}

async function testPreCheckoutApproved(): Promise<void> {
  const fx = await createFx();
  try {
    const payload = buildTelegramStarsInvoicePayload(fx.paymentId);
    const v = await validateStarsPreCheckout({
      id: 'pcq_1',
      fromId: Number(fx.telegramId),
      currency: 'XTR',
      totalAmount: 300,
      invoicePayload: payload,
    });
    assert.equal(v.ok, true);
    await handleStarsPreCheckoutQuery({
      id: 'pcq_1',
      fromId: Number(fx.telegramId),
      currency: 'XTR',
      totalAmount: 300,
      invoicePayload: payload,
    });
  } finally {
    await cleanup(fx);
  }
}

async function testPreCheckoutWrongAmount(): Promise<void> {
  const fx = await createFx();
  try {
    const payload = buildTelegramStarsInvoicePayload(fx.paymentId);
    const v = await validateStarsPreCheckout({
      id: 'pcq_2',
      fromId: Number(fx.telegramId),
      currency: 'XTR',
      totalAmount: 1,
      invoicePayload: payload,
    });
    assert.equal(v.ok, false);
  } finally {
    await cleanup(fx);
  }
}

async function testPreCheckoutWrongUser(): Promise<void> {
  const fx = await createFx();
  try {
    const payload = buildTelegramStarsInvoicePayload(fx.paymentId);
    const v = await validateStarsPreCheckout({
      id: 'pcq_3',
      fromId: 999999001,
      currency: 'XTR',
      totalAmount: 300,
      invoicePayload: payload,
    });
    assert.equal(v.ok, false);
  } finally {
    await cleanup(fx);
  }
}

async function testSuccessfulPaymentFlow(): Promise<void> {
  const fx = await createFx();
  try {
    const payload = buildTelegramStarsInvoicePayload(fx.paymentId);
    await handleStarsSuccessfulPayment({
      fromId: Number(fx.telegramId),
      currency: 'XTR',
      totalAmount: 300,
      invoicePayload: payload,
      telegramPaymentChargeId: `chg_${fx.paymentId}`,
    });
    const payment = await prisma.payment.findUnique({
      where: { id: fx.paymentId },
    });
    assert.equal(payment?.status, 'SUCCEEDED');
    const events = await prisma.monetizationEvent.findMany({
      where: { aggregateId: fx.paymentId },
    });
    assert.equal(events.length, 1);
    const ent = await prisma.entitlement.findFirst({
      where: { sourcePaymentId: fx.paymentId },
    });
    assert.ok(ent);
    assert.equal(ent?.status, 'ACTIVE');
  } finally {
    await cleanup(fx);
  }
}

async function testIdempotentSuccessfulPayment(): Promise<void> {
  const fx = await createFx();
  try {
    const payload = buildTelegramStarsInvoicePayload(fx.paymentId);
    const charge = `chg_idem_${fx.paymentId}`;
    await handleStarsSuccessfulPayment({
      fromId: Number(fx.telegramId),
      currency: 'XTR',
      totalAmount: 300,
      invoicePayload: payload,
      telegramPaymentChargeId: charge,
    });
    await handleStarsSuccessfulPayment({
      fromId: Number(fx.telegramId),
      currency: 'XTR',
      totalAmount: 300,
      invoicePayload: payload,
      telegramPaymentChargeId: charge,
    });
    const events = await prisma.monetizationEvent.findMany({
      where: { aggregateId: fx.paymentId },
    });
    assert.equal(events.length, 1);
    const ents = await prisma.entitlement.findMany({
      where: { sourcePaymentId: fx.paymentId },
    });
    assert.equal(ents.length, 1);
  } finally {
    await cleanup(fx);
  }
}

/** Full happy path incl. Profile: intent → … → Entitlement → summary. */
async function testProfileReflectsEntitlement(): Promise<void> {
  const fx = await createFx();
  try {
    const payload = buildTelegramStarsInvoicePayload(fx.paymentId);
    await handleStarsSuccessfulPayment({
      fromId: Number(fx.telegramId),
      currency: 'XTR',
      totalAmount: 300,
      invoicePayload: payload,
      telegramPaymentChargeId: `chg_profile_${fx.paymentId}`,
    });
    const summary = await getEntitlementsSummary(fx.userId);
    assert.equal(summary.premiumActive, true);
    assert.equal(summary.activePremium?.type, 'PREMIUM');
    assert.equal(summary.activePremium?.productCode, fx.productCode);
  } finally {
    await cleanup(fx);
  }
}

/** Intent expired between checkout and successful_payment → not activated. */
async function testExpiredPaymentRejected(): Promise<void> {
  const fx = await createFx();
  try {
    await prisma.payment.update({
      where: { id: fx.paymentId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    const payload = buildTelegramStarsInvoicePayload(fx.paymentId);

    const pre = await validateStarsPreCheckout({
      id: 'pcq_exp',
      fromId: Number(fx.telegramId),
      currency: 'XTR',
      totalAmount: 300,
      invoicePayload: payload,
    });
    assert.equal(pre.ok, false);

    await assert.rejects(() =>
      handleStarsSuccessfulPayment({
        fromId: Number(fx.telegramId),
        currency: 'XTR',
        totalAmount: 300,
        invoicePayload: payload,
        telegramPaymentChargeId: `chg_exp_${fx.paymentId}`,
      }),
    );

    const payment = await prisma.payment.findUnique({
      where: { id: fx.paymentId },
    });
    assert.notEqual(payment?.status, 'SUCCEEDED');
    const ent = await prisma.entitlement.findFirst({
      where: { sourcePaymentId: fx.paymentId },
    });
    assert.equal(ent, null);
  } finally {
    await cleanup(fx);
  }
}

/** Product disabled after intent → confirm must reject, no Premium. */
async function testDisabledProductRejectedAtConfirm(): Promise<void> {
  const fx = await createFx();
  try {
    await prisma.product.update({
      where: { id: fx.productId },
      data: { isActive: false },
    });

    await assert.rejects(
      () =>
        confirmPaymentFromProvider({
          paymentId: fx.paymentId,
          provider: 'TELEGRAM_STARS',
          externalPaymentId: `chg_disabled_${fx.paymentId}`,
          webhookAmountCheck: { amount: 300, currency: 'XTR' },
        }),
      (err: unknown) => err instanceof PaymentConfirmationError,
    );

    const payment = await prisma.payment.findUnique({
      where: { id: fx.paymentId },
    });
    assert.notEqual(payment?.status, 'SUCCEEDED');
    const ent = await prisma.entitlement.findFirst({
      where: { sourcePaymentId: fx.paymentId },
    });
    assert.equal(ent, null);
  } finally {
    await cleanup(fx);
  }
}

/** Disabled provider price after intent → confirm must reject. */
async function testDisabledPriceRejectedAtConfirm(): Promise<void> {
  const fx = await createFx();
  try {
    await prisma.productProviderPrice.updateMany({
      where: { productId: fx.productId, provider: 'TELEGRAM_STARS' },
      data: { isActive: false },
    });

    await assert.rejects(
      () =>
        confirmPaymentFromProvider({
          paymentId: fx.paymentId,
          provider: 'TELEGRAM_STARS',
          externalPaymentId: `chg_noprice_${fx.paymentId}`,
          webhookAmountCheck: { amount: 300, currency: 'XTR' },
        }),
      (err: unknown) => err instanceof PaymentConfirmationError,
    );

    const ent = await prisma.entitlement.findFirst({
      where: { sourcePaymentId: fx.paymentId },
    });
    assert.equal(ent, null);
  } finally {
    await cleanup(fx);
  }
}

/** Same telegram charge id on a second payment → charge conflict. */
async function testChargeConflict(): Promise<void> {
  const fx = await createFx();
  const second = await prisma.payment.create({
    data: {
      userId: fx.userId,
      productId: fx.productId,
      provider: 'TELEGRAM_STARS',
      status: 'PENDING',
      amount: 300,
      currency: 'XTR',
      idempotencyKey: `${runId}_conflict_${fx.userId}`,
      expiresAt: paymentIntentExpiresAt(),
    },
  });
  try {
    const charge = `chg_shared_${fx.paymentId}`;
    await handleStarsSuccessfulPayment({
      fromId: Number(fx.telegramId),
      currency: 'XTR',
      totalAmount: 300,
      invoicePayload: buildTelegramStarsInvoicePayload(fx.paymentId),
      telegramPaymentChargeId: charge,
    });

    await assert.rejects(() =>
      handleStarsSuccessfulPayment({
        fromId: Number(fx.telegramId),
        currency: 'XTR',
        totalAmount: 300,
        invoicePayload: buildTelegramStarsInvoicePayload(second.id),
        telegramPaymentChargeId: charge,
      }),
    );

    const secondRow = await prisma.payment.findUnique({
      where: { id: second.id },
    });
    assert.notEqual(secondRow?.status, 'SUCCEEDED');
  } finally {
    await prisma.payment.deleteMany({ where: { id: second.id } });
    await cleanup(fx);
  }
}

/** Outbox retry catches up a SUCCEEDED payment whose Entitlement is missing. */
async function testOutboxRetryCatchesUpEntitlement(): Promise<void> {
  const fx = await createFx();
  try {
    await handleStarsSuccessfulPayment({
      fromId: Number(fx.telegramId),
      currency: 'XTR',
      totalAmount: 300,
      invoicePayload: buildTelegramStarsInvoicePayload(fx.paymentId),
      telegramPaymentChargeId: `chg_retry_${fx.paymentId}`,
    });

    // Simulate a lost grant: drop the entitlement + reopen the event.
    await prisma.entitlement.deleteMany({
      where: { sourcePaymentId: fx.paymentId },
    });
    await prisma.monetizationEvent.updateMany({
      where: { idempotencyKey: paymentConfirmedEventKey(fx.paymentId) },
      data: { status: 'PENDING', availableAt: new Date(), attempts: 0 },
    });

    await processPendingEvents(50);

    const ent = await prisma.entitlement.findFirst({
      where: { sourcePaymentId: fx.paymentId },
    });
    assert.ok(ent);
    assert.equal(ent?.status, 'ACTIVE');
  } finally {
    await cleanup(fx);
  }
}

/** Cleanup expires stale CREATED/PENDING intents, never touches SUCCEEDED. */
async function testCleanupExpiresStalePayments(): Promise<void> {
  const fx = await createFx();
  const succeededFx = await createFx();
  try {
    // Stale PENDING intent (fx): expiresAt in the past.
    await prisma.payment.update({
      where: { id: fx.paymentId },
      data: { status: 'PENDING', expiresAt: new Date(Date.now() - 60_000) },
    });
    // SUCCEEDED payment must never be expired even if expiresAt is past.
    await prisma.payment.update({
      where: { id: succeededFx.paymentId },
      data: { status: 'SUCCEEDED', expiresAt: new Date(Date.now() - 60_000) },
    });

    const count = await expireStalePayments();
    assert.ok(count >= 1);

    const stale = await prisma.payment.findUnique({
      where: { id: fx.paymentId },
    });
    assert.equal(stale?.status, 'EXPIRED');

    const succeeded = await prisma.payment.findUnique({
      where: { id: succeededFx.paymentId },
    });
    assert.equal(succeeded?.status, 'SUCCEEDED');
  } finally {
    await cleanup(fx);
    await cleanup(succeededFx);
  }
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.warn('[telegram-stars-integration] DATABASE_URL unset — skipped');
    process.exit(0);
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    console.warn('[telegram-stars-integration] DB unreachable — skipped');
    process.exit(0);
  }

  await testIntentUsesDbPrice();
  await testPreCheckoutApproved();
  await testPreCheckoutWrongAmount();
  await testPreCheckoutWrongUser();
  await testSuccessfulPaymentFlow();
  await testIdempotentSuccessfulPayment();
  await testProfileReflectsEntitlement();
  await testExpiredPaymentRejected();
  await testDisabledProductRejectedAtConfirm();
  await testDisabledPriceRejectedAtConfirm();
  await testChargeConflict();
  await testOutboxRetryCatchesUpEntitlement();
  await testCleanupExpiresStalePayments();

  console.log('[telegram-stars-integration] passed');
}

main()
  .catch((e) => {
    console.error('[telegram-stars-integration] failed', e);
    process.exitCode = 1;
  })
  .finally(() => {
    setTelegramApiFetchForTests(null);
    return prisma.$disconnect();
  });
