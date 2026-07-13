import type { PaymentProvider } from '@98plus/shared';
import type {
  Payment,
  Plan,
  Product,
  ProductProviderPrice,
} from '@prisma/client';

export class ProviderConfirmationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderConfirmationValidationError';
  }
}

export interface WebhookAmountCheck {
  amount?: number;
  currency?: string;
}

/**
 * Validates provider-reported amount/currency against the server Payment row.
 * Real webhook adapters (Telegram Stars, Tribute) must call this before confirm.
 */
export function validateProviderConfirmationAgainstPayment(
  payment: Pick<Payment, 'amount' | 'currency' | 'provider' | 'productId'>,
  provider: PaymentProvider,
  webhook?: WebhookAmountCheck,
  serverPrice?: Pick<ProductProviderPrice, 'amount' | 'currency'> | null,
): void {
  if (payment.provider !== provider) {
    throw new ProviderConfirmationValidationError('Provider mismatch');
  }

  if (!webhook) return;

  if (
    webhook.amount !== undefined &&
    webhook.amount !== payment.amount
  ) {
    throw new ProviderConfirmationValidationError(
      'Webhook amount does not match server Payment',
    );
  }

  if (
    webhook.currency !== undefined &&
    webhook.currency !== payment.currency
  ) {
    throw new ProviderConfirmationValidationError(
      'Webhook currency does not match server Payment',
    );
  }

  if (serverPrice) {
    if (webhook.amount !== undefined && webhook.amount !== serverPrice.amount) {
      throw new ProviderConfirmationValidationError(
        'Webhook amount does not match ProductProviderPrice',
      );
    }
    if (
      webhook.currency !== undefined &&
      webhook.currency !== serverPrice.currency
    ) {
      throw new ProviderConfirmationValidationError(
        'Webhook currency does not match ProductProviderPrice',
      );
    }
  }
}

type PaymentForConfirm = Pick<
  Payment,
  'amount' | 'currency' | 'provider' | 'productId' | 'status' | 'expiresAt'
>;
type ProductForConfirm = Pick<Product, 'isActive' | 'isVisible'>;
type PlanForConfirm = Pick<Plan, 'isVisible'>;
type PriceForConfirm = Pick<
  ProductProviderPrice,
  'amount' | 'currency' | 'isActive'
>;

/**
 * Full server-side re-validation for a provider-confirmed payment. This is the
 * authoritative gate at confirm time — it must catch anything that changed
 * between pre_checkout and successful_payment (product/plan/price disabled,
 * intent expired, wrong status, amount/currency drift). Reuses
 * {@link validateProviderConfirmationAgainstPayment} for the amount/currency
 * comparison so that logic is never duplicated.
 *
 * Only call this for a fresh confirmation (payment not yet SUCCEEDED); the
 * idempotent replay path must be handled by the caller before this runs.
 */
export function assertPaymentConfirmable(input: {
  payment: PaymentForConfirm;
  product: ProductForConfirm;
  plan: PlanForConfirm | null;
  serverPrice: PriceForConfirm | null;
  provider: PaymentProvider;
  webhook?: WebhookAmountCheck;
  now?: Date;
}): void {
  const {
    payment,
    product,
    plan,
    serverPrice,
    provider,
    webhook,
    now = new Date(),
  } = input;

  if (payment.provider !== provider) {
    throw new ProviderConfirmationValidationError('Provider mismatch');
  }

  if (payment.status !== 'CREATED' && payment.status !== 'PENDING') {
    throw new ProviderConfirmationValidationError(
      `Payment is not confirmable in status ${payment.status}`,
    );
  }

  if (payment.expiresAt && payment.expiresAt.getTime() <= now.getTime()) {
    throw new ProviderConfirmationValidationError('Payment intent expired');
  }

  if (!product.isActive || !product.isVisible) {
    throw new ProviderConfirmationValidationError(
      'Product is no longer available',
    );
  }

  if (plan && !plan.isVisible) {
    throw new ProviderConfirmationValidationError(
      'Plan is no longer available',
    );
  }

  if (!serverPrice || !serverPrice.isActive) {
    throw new ProviderConfirmationValidationError(
      'Provider price is no longer available',
    );
  }

  validateProviderConfirmationAgainstPayment(
    payment,
    provider,
    webhook,
    serverPrice,
  );
}
