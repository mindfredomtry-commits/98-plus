import type { Payment, Product, User } from '@prisma/client';
import {
  buildTelegramStarsInvoicePayload,
  isTelegramStarsEnabled,
  parseTelegramStarsInvoicePayload,
  TELEGRAM_STARS_PAYMENT_TTL_HOURS,
  telegramStarsInvoiceDescription,
  telegramStarsInvoiceTitle,
  telegramStarsPriceLabel,
} from '../config/telegram-stars';
import { prisma } from '../lib/prisma';
import {
  telegramAnswerPreCheckoutQuery,
  telegramCreateInvoiceLink,
} from '../lib/telegram-api';
import {
  canonicalizeTelegramInvoiceUrl,
  safeTelegramInvoiceHost,
  telegramInvoiceUrlHasSlug,
  TelegramStarsInvoiceUrlError,
} from '../lib/telegram-invoice-url';
import type { ProviderCreatePaymentResult } from '@98plus/shared';
import {
  confirmPaymentFromProvider,
} from './payment-confirmation.service';
import { telegramStarsLog } from './telegram-stars-logger';
import { validateProviderConfirmationAgainstPayment } from './payment-provider-validation';

export interface PreCheckoutQueryInput {
  id: string;
  fromId: number;
  currency: string;
  totalAmount: number;
  invoicePayload: string;
  updateId?: number;
}

export interface SuccessfulPaymentInput {
  fromId: number;
  currency: string;
  totalAmount: number;
  invoicePayload: string;
  telegramPaymentChargeId: string;
  providerPaymentChargeId?: string;
  isRecurring?: boolean;
  subscriptionExpirationDate?: number;
  updateId?: number;
}

type PaymentWithRelations = Payment & {
  user: User;
  product: Product;
};

export function paymentIntentExpiresAt(from: Date = new Date()): Date {
  return new Date(
    from.getTime() + TELEGRAM_STARS_PAYMENT_TTL_HOURS * 60 * 60 * 1000,
  );
}

export function isPaymentExpired(payment: Pick<Payment, 'expiresAt'>): boolean {
  if (!payment.expiresAt) return false;
  return payment.expiresAt.getTime() <= Date.now();
}

async function loadPaymentForStars(
  paymentId: string,
): Promise<PaymentWithRelations | null> {
  return prisma.payment.findUnique({
    where: { id: paymentId },
    include: { user: true, product: true },
  });
}

export interface StarsPreCheckoutValidation {
  ok: boolean;
  errorMessage?: string;
  payment?: PaymentWithRelations;
}

/** Fast validation for pre_checkout_query — no outbox or external calls. */
export async function validateStarsPreCheckout(
  input: PreCheckoutQueryInput,
): Promise<StarsPreCheckoutValidation> {
  if (!isTelegramStarsEnabled()) {
    return { ok: false, errorMessage: 'Оплата Stars временно недоступна' };
  }

  const paymentId = parseTelegramStarsInvoicePayload(input.invoicePayload);
  if (!paymentId) {
    return { ok: false, errorMessage: 'Некорректный платёж' };
  }

  const payment = await loadPaymentForStars(paymentId);
  if (!payment) {
    return { ok: false, errorMessage: 'Платёж не найден' };
  }

  if (payment.provider !== 'TELEGRAM_STARS') {
    return { ok: false, errorMessage: 'Неверный способ оплаты' };
  }

  if (payment.status !== 'CREATED' && payment.status !== 'PENDING') {
    return { ok: false, errorMessage: 'Платёж уже обработан' };
  }

  if (isPaymentExpired(payment)) {
    return { ok: false, errorMessage: 'Срок оплаты истёк' };
  }

  if (payment.user.telegramId !== BigInt(input.fromId)) {
    return { ok: false, errorMessage: 'Платёж привязан к другому аккаунту' };
  }

  if (input.currency !== 'XTR') {
    return { ok: false, errorMessage: 'Неверная валюта' };
  }

  if (input.totalAmount !== payment.amount) {
    return { ok: false, errorMessage: 'Сумма не совпадает' };
  }

  if (!payment.product.isActive || !payment.product.isVisible) {
    return { ok: false, errorMessage: 'Тариф недоступен' };
  }

  const serverPrice = await prisma.productProviderPrice.findUnique({
    where: {
      productId_provider: {
        productId: payment.productId,
        provider: 'TELEGRAM_STARS',
      },
    },
  });

  if (!serverPrice?.isActive || serverPrice.currency !== 'XTR') {
    return { ok: false, errorMessage: 'Цена недоступна' };
  }

  if (
    serverPrice.amount !== payment.amount ||
    serverPrice.amount !== input.totalAmount
  ) {
    return { ok: false, errorMessage: 'Цена изменилась' };
  }

  return { ok: true, payment };
}

export async function handleStarsPreCheckoutQuery(
  input: PreCheckoutQueryInput,
): Promise<void> {
  telegramStarsLog.preCheckoutReceived({
    paymentId: parseTelegramStarsInvoicePayload(input.invoicePayload) ?? undefined,
    telegramUserId: input.fromId,
    amount: input.totalAmount,
    currency: input.currency,
    updateId: input.updateId,
  });

  const validation = await validateStarsPreCheckout(input);

  if (!validation.ok || !validation.payment) {
    telegramStarsLog.preCheckoutRejected({
      paymentId:
        parseTelegramStarsInvoicePayload(input.invoicePayload) ?? undefined,
      telegramUserId: input.fromId,
      status: validation.errorMessage,
      updateId: input.updateId,
    });
    await telegramAnswerPreCheckoutQuery({
      preCheckoutQueryId: input.id,
      ok: false,
      errorMessage: validation.errorMessage ?? 'Оплата отклонена',
    });
    return;
  }

  telegramStarsLog.preCheckoutApproved({
    paymentId: validation.payment.id,
    internalUserId: validation.payment.userId,
    telegramUserId: input.fromId,
    productCode: validation.payment.product.code,
    amount: input.totalAmount,
    currency: input.currency,
    updateId: input.updateId,
  });

  await telegramAnswerPreCheckoutQuery({
    preCheckoutQueryId: input.id,
    ok: true,
  });
}

export async function handleStarsSuccessfulPayment(
  input: SuccessfulPaymentInput,
): Promise<void> {
  const paymentId = parseTelegramStarsInvoicePayload(input.invoicePayload);
  telegramStarsLog.successfulPaymentReceived({
    paymentId: paymentId ?? undefined,
    telegramUserId: input.fromId,
    amount: input.totalAmount,
    currency: input.currency,
    updateId: input.updateId,
  });

  if (!paymentId) {
    throw new Error('Invalid invoice payload');
  }

  const payment = await loadPaymentForStars(paymentId);
  if (!payment) {
    throw new Error('Payment not found');
  }

  if (payment.user.telegramId !== BigInt(input.fromId)) {
    throw new Error('Payment owner mismatch');
  }

  if (payment.provider !== 'TELEGRAM_STARS') {
    throw new Error('Provider mismatch');
  }

  if (input.currency !== 'XTR' || input.totalAmount !== payment.amount) {
    throw new Error('Amount/currency mismatch');
  }

  const serverPrice = await prisma.productProviderPrice.findUnique({
    where: {
      productId_provider: {
        productId: payment.productId,
        provider: 'TELEGRAM_STARS',
      },
    },
  });

  validateProviderConfirmationAgainstPayment(
    payment,
    'TELEGRAM_STARS',
    { amount: input.totalAmount, currency: input.currency },
    serverPrice,
  );

  const chargeConflict = await prisma.payment.findFirst({
    where: {
      provider: 'TELEGRAM_STARS',
      externalPaymentId: input.telegramPaymentChargeId,
      NOT: { id: paymentId },
    },
  });
  if (chargeConflict) {
    throw new Error('Charge ID conflict');
  }

  const result = await confirmPaymentFromProvider({
    paymentId,
    provider: 'TELEGRAM_STARS',
    externalPaymentId: input.telegramPaymentChargeId,
    confirmedAt: new Date(),
    webhookAmountCheck: {
      amount: input.totalAmount,
      currency: input.currency,
    },
    safeProviderPayload: {
      telegramPaymentChargeId: input.telegramPaymentChargeId,
      ...(input.providerPaymentChargeId
        ? { providerPaymentChargeId: input.providerPaymentChargeId }
        : {}),
      currency: input.currency,
      totalAmount: input.totalAmount,
      invoicePayload: input.invoicePayload,
      ...(input.isRecurring !== undefined
        ? { isRecurring: input.isRecurring }
        : {}),
      ...(input.subscriptionExpirationDate !== undefined
        ? { subscriptionExpirationDate: input.subscriptionExpirationDate }
        : {}),
    },
  });

  if (result.alreadyConfirmed) {
    telegramStarsLog.paymentIdempotent({
      paymentId,
      internalUserId: payment.userId,
      telegramUserId: input.fromId,
      productCode: payment.product.code,
      status: 'SUCCEEDED',
      updateId: input.updateId,
    });
  } else {
    telegramStarsLog.paymentConfirmed({
      paymentId,
      internalUserId: payment.userId,
      telegramUserId: input.fromId,
      productCode: payment.product.code,
      amount: input.totalAmount,
      currency: input.currency,
      status: 'SUCCEEDED',
      updateId: input.updateId,
    });
  }
}

export async function createTelegramStarsInvoice(
  input: {
    paymentId: string;
    amount: number;
    currency: string;
    productCode: string;
    productTitle: string;
  },
): Promise<ProviderCreatePaymentResult> {
  if (!isTelegramStarsEnabled()) {
    return {
      nextAction: 'PROVIDER_DISABLED',
      status: 'CREATED',
      message: 'оплата Stars временно недоступна',
    };
  }

  if (input.currency !== 'XTR') {
    return {
      nextAction: 'NOT_CONFIGURED',
      status: 'FAILED',
      message: 'неверная валюта для Stars',
    };
  }

  const payload = buildTelegramStarsInvoicePayload(input.paymentId);
  const title = telegramStarsInvoiceTitle();
  const description = telegramStarsInvoiceDescription();

  const apiResult = await telegramCreateInvoiceLink({
    title,
    description,
    payload,
    currency: 'XTR',
    prices: [
      {
        label: telegramStarsPriceLabel(input.productTitle),
        amount: input.amount,
      },
    ],
  });

  if (!apiResult.ok || typeof apiResult.result !== 'string') {
    telegramStarsLog.invoiceOpenFailed({
      paymentId: input.paymentId,
      productCode: input.productCode,
      amount: input.amount,
      currency: input.currency,
      status: apiResult.description ?? 'telegram_api_error',
    });
    return {
      nextAction: 'NOT_CONFIGURED',
      status: 'CREATED',
      message: 'Не удалось открыть оплату. Попробуйте ещё раз',
      providerPayload: {
        invoiceError: true,
        invoiceErrorAt: new Date().toISOString(),
      },
    };
  }

  let invoiceUrl: string;
  try {
    invoiceUrl = canonicalizeTelegramInvoiceUrl(apiResult.result);
  } catch (e) {
    const raw = apiResult.result;
    let protocol: string | null = null;
    try {
      protocol = new URL(raw).protocol;
    } catch {
      protocol = null;
    }
    telegramStarsLog.invoiceOpenFailed({
      paymentId: input.paymentId,
      productCode: input.productCode,
      amount: input.amount,
      currency: input.currency,
      status:
        e instanceof TelegramStarsInvoiceUrlError
          ? 'invalid_invoice_url'
          : 'invoice_url_error',
      rawHost: safeTelegramInvoiceHost(raw),
      protocol,
      hasInvoiceSlug: telegramInvoiceUrlHasSlug(raw),
    });
    return {
      nextAction: 'NOT_CONFIGURED',
      status: 'CREATED',
      message: 'Не удалось открыть оплату. Попробуйте ещё раз',
      providerPayload: {
        invoiceError: true,
        invoiceErrorAt: new Date().toISOString(),
      },
    };
  }

  telegramStarsLog.invoiceCreated({
    paymentId: input.paymentId,
    productCode: input.productCode,
    amount: input.amount,
    currency: input.currency,
    status: 'PENDING',
    canonicalHost: 't.me',
  });

  return {
    nextAction: 'OPEN_INVOICE',
    status: 'PENDING',
    message: 'откроется оплата Telegram Stars',
    invoiceUrl,
    providerPayload: {
      channel: 'TELEGRAM_STARS',
      implementation: 'telegram_stars',
      invoiceCreatedAt: new Date().toISOString(),
      invoicePayloadVersion: 1,
      productCode: input.productCode,
      invoicePayload: payload,
    },
  };
}

/** TODO: wire refundStarPayment when refund flow is implemented. */
export async function refundTelegramStarsPayment(
  _paymentId: string,
): Promise<{ ok: boolean; reason: string }> {
  return { ok: false, reason: 'NOT_IMPLEMENTED' };
}

export function buildPaySupportMessage(): string {
  const contact = process.env.PAYMENT_SUPPORT_CONTACT?.trim();
  const lines = [
    'Поддержка по оплате 98+ premium',
    '',
    'Если оплата прошла, но доступ не активировался, напиши в поддержку и укажи:',
    '• примерное время оплаты',
    '• свой Telegram @username',
    '',
    'Не отправляй данные банковской карты.',
  ];
  if (contact) {
    lines.push('', `Связь: ${contact}`);
  } else {
    lines.push('', 'Связь с поддержкой будет добавлена позже.');
  }
  return lines.join('\n');
}
