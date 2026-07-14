import type {
  PaymentProvider,
  PaymentIntentResult,
  ProviderCreatePaymentResult,
} from '@98plus/shared';
import { ANALYTICS_EVENTS } from '@98plus/shared';
import type { Payment, Prisma } from '@prisma/client';
import { isTelegramStarsEnabled } from '../config/telegram-stars';
import { paymentIntentExpiresAt } from './telegram-stars-payment.service';
import { prisma } from '../lib/prisma';
import { trackEvent } from './analytics.service';
import { getActiveProductByCode } from './product.service';
import { getPaymentAdapter } from './payment-adapters';
import { canCreateIntentForProvider } from './payment-provider-registry';
import { telegramStarsLog } from './telegram-stars-logger';

/** Domain error carrying an HTTP status for the route layer. */
export class PaymentServiceError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'PaymentServiceError';
  }
}

interface CreateIntentInput {
  userId: string;
  productCode: string;
  provider: PaymentProvider;
  idempotencyKey: string;
}

function readStoredInvoiceUrl(
  providerPayload: Prisma.JsonValue | null,
): string | null {
  if (!providerPayload || typeof providerPayload !== 'object') return null;
  const url = (providerPayload as Record<string, unknown>).invoiceUrl;
  return typeof url === 'string' ? url : null;
}

function toIntentResult(
  payment: Pick<Payment, 'id' | 'status' | 'provider'>,
  providerResult?: ProviderCreatePaymentResult,
): PaymentIntentResult {
  const storedUrl = providerResult?.invoiceUrl ?? null;
  return {
    paymentId: payment.id,
    status: providerResult?.status ?? payment.status,
    provider: payment.provider,
    nextAction: providerResult?.nextAction ?? 'NOT_CONFIGURED',
    message: providerResult?.message ?? 'способ оплаты подключается',
    ...(storedUrl ? { invoiceUrl: storedUrl } : {}),
  };
}

/** Packs the final HTTP body with the adapter invoice URL for a single route-layer trace. */
function packIntentResponse(
  payment: Pick<Payment, 'id' | 'status' | 'provider'>,
  providerResult?: ProviderCreatePaymentResult,
): {
  responseBody: PaymentIntentResult;
  adapterInvoiceUrl: string | null;
} {
  return {
    responseBody: toIntentResult(payment, providerResult),
    adapterInvoiceUrl:
      typeof providerResult?.invoiceUrl === 'string'
        ? providerResult.invoiceUrl
        : null,
  };
}

async function resolveStarsIntent(
  payment: Payment,
  product: { code: string; title: string },
  price: { amount: number; currency: string; externalProductId: string | null },
): Promise<ProviderCreatePaymentResult> {
  const storedUrl = readStoredInvoiceUrl(payment.providerPayload);
  if (
    storedUrl &&
    (payment.status === 'CREATED' || payment.status === 'PENDING')
  ) {
    return {
      nextAction: 'OPEN_INVOICE',
      status: payment.status,
      message: 'откроется оплата Telegram Stars',
      invoiceUrl: storedUrl,
    };
  }

  const adapter = getPaymentAdapter('TELEGRAM_STARS');
  if (!adapter) {
    return {
      nextAction: 'NOT_CONFIGURED',
      status: payment.status,
      message: 'способ оплаты подключается',
    };
  }

  return adapter.createPayment({
    paymentId: payment.id,
    amount: price.amount,
    currency: price.currency,
    externalProductId: price.externalProductId,
    productCode: product.code,
    productTitle: product.title,
  });
}

/**
 * Create a payment intent. For Telegram Stars (when enabled) creates a real
 * invoice link. Entitlement is NEVER granted here.
 *
 * Returns both the exact HTTP response body and the adapter-side invoice URL
 * so the route can emit one diagnostic trace immediately before res.json.
 */
export async function createPaymentIntentHttp(
  input: CreateIntentInput,
): Promise<{
  responseBody: PaymentIntentResult;
  adapterInvoiceUrl: string | null;
}> {
  const { userId, productCode, provider, idempotencyKey } = input;

  if (provider === 'TELEGRAM_STARS' && !isTelegramStarsEnabled()) {
    throw new PaymentServiceError('Telegram Stars is disabled', 503);
  }

  if (!canCreateIntentForProvider(provider)) {
    throw new PaymentServiceError('Provider is not available', 400);
  }

  const product = await getActiveProductByCode(productCode);
  if (!product) {
    throw new PaymentServiceError('Product not found or inactive', 404);
  }

  const price = product.prices.find(
    (p) => p.provider === provider && p.isActive,
  );
  if (!price) {
    throw new PaymentServiceError('No active price for this provider', 400);
  }

  if (provider === 'TELEGRAM_STARS' && price.currency !== 'XTR') {
    throw new PaymentServiceError('Invalid Stars price currency', 400);
  }

  const existing = await prisma.payment.findUnique({
    where: { idempotencyKey },
  });
  if (existing) {
    if (existing.userId !== userId) {
      throw new PaymentServiceError('Payment belongs to another user', 403);
    }
    if (provider === 'TELEGRAM_STARS' && isTelegramStarsEnabled()) {
      const providerResult = await resolveStarsIntent(existing, product, price);
      if (providerResult.providerPayload || providerResult.invoiceUrl) {
        await prisma.payment.update({
          where: { id: existing.id },
          data: {
            status: providerResult.status,
            ...(providerResult.providerPayload
              ? {
                  providerPayload: {
                    ...(typeof existing.providerPayload === 'object' &&
                    existing.providerPayload
                      ? (existing.providerPayload as object)
                      : {}),
                    ...providerResult.providerPayload,
                    ...(providerResult.invoiceUrl
                      ? { invoiceUrl: providerResult.invoiceUrl }
                      : {}),
                  } as Prisma.InputJsonValue,
                }
              : {}),
          },
        });
      }
      return packIntentResponse(
        { ...existing, status: providerResult.status },
        providerResult,
      );
    }
    return packIntentResponse(existing);
  }

  const adapter = getPaymentAdapter(provider);
  if (!adapter) {
    throw new PaymentServiceError('Provider adapter not available', 400);
  }

  const expiresAt =
    provider === 'TELEGRAM_STARS' ? paymentIntentExpiresAt() : undefined;

  let payment: Payment;
  try {
    payment = await prisma.payment.create({
      data: {
        userId,
        productId: product.id,
        provider,
        status: 'CREATED',
        amount: price.amount,
        currency: price.currency,
        idempotencyKey,
        expiresAt,
      },
    });
  } catch (err) {
    const race = await prisma.payment.findUnique({ where: { idempotencyKey } });
    if (race) {
      if (provider === 'TELEGRAM_STARS' && isTelegramStarsEnabled()) {
        const providerResult = await resolveStarsIntent(race, product, price);
        return packIntentResponse(race, providerResult);
      }
      return packIntentResponse(race);
    }
    throw err;
  }

  if (provider === 'TELEGRAM_STARS') {
    telegramStarsLog.intentCreated({
      paymentId: payment.id,
      internalUserId: userId,
      productCode: product.code,
      amount: price.amount,
      currency: price.currency,
      status: payment.status,
    });
  }

  const providerResult = await adapter.createPayment({
    paymentId: payment.id,
    amount: price.amount,
    currency: price.currency,
    externalProductId: price.externalProductId,
    productCode: product.code,
    productTitle: product.title,
  });

  const mergedPayload = providerResult.providerPayload
    ? ({
        ...providerResult.providerPayload,
        ...(providerResult.invoiceUrl
          ? { invoiceUrl: providerResult.invoiceUrl }
          : {}),
      } as Prisma.InputJsonValue)
    : providerResult.invoiceUrl
      ? ({ invoiceUrl: providerResult.invoiceUrl } as Prisma.InputJsonValue)
      : undefined;

  if (mergedPayload || providerResult.status !== 'CREATED') {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: providerResult.status,
        ...(mergedPayload ? { providerPayload: mergedPayload } : {}),
        ...(providerResult.status === 'FAILED'
          ? { failureReason: providerResult.message }
          : {}),
      },
    });
  }

  await trackEvent(ANALYTICS_EVENTS.CREATE_PAYMENT_INTENT, userId, {
    productCode: product.code,
    provider,
    status: providerResult.status,
    nextAction: providerResult.nextAction,
  });

  return packIntentResponse(
    { ...payment, status: providerResult.status },
    providerResult,
  );
}

/**
 * Create a payment intent. For Telegram Stars (when enabled) creates a real
 * invoice link. Entitlement is NEVER granted here.
 */
export async function createPaymentIntent(
  input: CreateIntentInput,
): Promise<PaymentIntentResult> {
  return (await createPaymentIntentHttp(input)).responseBody;
}
