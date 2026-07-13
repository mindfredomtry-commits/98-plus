import type {
  PaymentProvider,
  ProviderCreatePaymentResult,
} from '@98plus/shared';
import { createTelegramStarsInvoice, refundTelegramStarsPayment } from './telegram-stars-payment.service';

export type PaymentImplementation =
  | 'telegram_stars'
  | 'tribute'
  | 'yookassa'
  | 'stripe';

export const PROVIDER_IMPLEMENTATION: Record<
  PaymentProvider,
  PaymentImplementation | null
> = {
  TELEGRAM_STARS: 'telegram_stars',
  SBP: 'tribute',
  CARD_RU: 'yookassa',
  CARD_INT: 'stripe',
};

export interface PaymentProviderAdapter {
  readonly channel: PaymentProvider;
  readonly implementation: PaymentImplementation;

  createPayment(input: {
    paymentId: string;
    amount: number;
    currency: string;
    externalProductId: string | null;
    productCode: string;
    productTitle?: string;
  }): Promise<ProviderCreatePaymentResult>;

  handleWebhook(payload: unknown): Promise<{
    externalPaymentId: string | null;
    verified: boolean;
    status: 'succeeded' | 'failed' | 'pending' | 'unknown';
  }>;

  getPaymentStatus(externalPaymentId: string): Promise<{
    status: 'succeeded' | 'failed' | 'pending' | 'unknown';
  }>;

  refundPayment(paymentId: string): Promise<{ ok: boolean; reason?: string }>;
}

const NOT_CONFIGURED_MESSAGE = 'способ оплаты подключается';

abstract class TechnicalAdapter implements PaymentProviderAdapter {
  abstract readonly channel: PaymentProvider;
  abstract readonly implementation: PaymentImplementation;

  async createPayment(): Promise<ProviderCreatePaymentResult> {
    return {
      nextAction: 'NOT_CONFIGURED',
      status: 'CREATED',
      message: NOT_CONFIGURED_MESSAGE,
      providerPayload: {
        channel: this.channel,
        implementation: this.implementation,
        configured: false,
      },
    };
  }

  async handleWebhook(): Promise<{
    externalPaymentId: string | null;
    verified: boolean;
    status: 'succeeded' | 'failed' | 'pending' | 'unknown';
  }> {
    return { externalPaymentId: null, verified: false, status: 'unknown' };
  }

  async getPaymentStatus(): Promise<{
    status: 'succeeded' | 'failed' | 'pending' | 'unknown';
  }> {
    return { status: 'unknown' };
  }

  async refundPayment(): Promise<{ ok: boolean; reason?: string }> {
    return { ok: false, reason: 'NOT_IMPLEMENTED' };
  }
}

export class TelegramStarsProvider implements PaymentProviderAdapter {
  readonly channel = 'TELEGRAM_STARS' as const;
  readonly implementation = 'telegram_stars' as const;

  async createPayment(input: {
    paymentId: string;
    amount: number;
    currency: string;
    externalProductId: string | null;
    productCode: string;
    productTitle?: string;
  }): Promise<ProviderCreatePaymentResult> {
    return createTelegramStarsInvoice({
      paymentId: input.paymentId,
      amount: input.amount,
      currency: input.currency,
      productCode: input.productCode,
      productTitle: input.productTitle ?? input.productCode,
    });
  }

  async handleWebhook(): Promise<{
    externalPaymentId: string | null;
    verified: boolean;
    status: 'succeeded' | 'failed' | 'pending' | 'unknown';
  }> {
    // Stars confirmations are handled via Telegraf pre_checkout_query /
    // successful_payment in bot/telegram-stars-handlers.ts → confirmPaymentFromProvider.
    return { externalPaymentId: null, verified: false, status: 'unknown' };
  }

  async getPaymentStatus(): Promise<{
    status: 'succeeded' | 'failed' | 'pending' | 'unknown';
  }> {
    return { status: 'unknown' };
  }

  async refundPayment(
    paymentId: string,
  ): Promise<{ ok: boolean; reason?: string }> {
    return refundTelegramStarsPayment(paymentId);
  }
}

export class TributeProvider extends TechnicalAdapter {
  readonly channel = 'SBP' as const;
  readonly implementation = 'tribute' as const;
}

const ADAPTERS: Partial<Record<PaymentImplementation, PaymentProviderAdapter>> =
  {
    telegram_stars: new TelegramStarsProvider(),
    tribute: new TributeProvider(),
  };

export function getPaymentAdapter(
  provider: PaymentProvider,
): PaymentProviderAdapter | null {
  const implementation = PROVIDER_IMPLEMENTATION[provider];
  if (!implementation) return null;
  return ADAPTERS[implementation] ?? null;
}
