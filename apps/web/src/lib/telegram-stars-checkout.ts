import type { PaymentIntentResult } from '@98plus/shared';
import { pollPaymentActivation, type PaymentPollResult } from './poll-payment-status';

export type InvoiceCloseStatus =
  | 'paid'
  | 'cancelled'
  | 'failed'
  | 'pending'
  | string;

export function hasTelegramOpenInvoice(): boolean {
  if (typeof window === 'undefined') return false;
  const openInvoice = (
    window.Telegram?.WebApp as { openInvoice?: unknown } | undefined
  )?.openInvoice;
  return typeof openInvoice === 'function';
}

/**
 * Opens Telegram Stars invoice. Callback is UX-only — never activates Premium.
 */
export function openTelegramStarsInvoice(
  invoiceUrl: string,
): Promise<InvoiceCloseStatus> {
  return new Promise((resolve) => {
    const webApp = window.Telegram?.WebApp as
      | {
          openInvoice?: (
            url: string,
            callback: (status: InvoiceCloseStatus) => void,
          ) => void;
        }
      | undefined;

    if (!webApp?.openInvoice) {
      resolve('failed');
      return;
    }

    try {
      webApp.openInvoice(invoiceUrl, (status) => {
        resolve(status ?? 'failed');
      });
    } catch {
      resolve('failed');
    }
  });
}

export type StarsCheckoutPhase =
  | 'idle'
  | 'creating_intent'
  | 'opening_invoice'
  | 'confirming'
  | 'success'
  | 'cancelled'
  | 'failed'
  | 'pending_activation';

export interface StarsCheckoutOutcome {
  phase: StarsCheckoutPhase;
  message: string;
  paymentId?: string;
  expiresAt?: string | null;
}

export async function runTelegramStarsCheckout(input: {
  createIntent: () => Promise<PaymentIntentResult>;
  pollStatus: (paymentId: string) => Promise<PaymentPollResult>;
}): Promise<StarsCheckoutOutcome> {
  if (!hasTelegramOpenInvoice()) {
    return {
      phase: 'failed',
      message: 'оплата Stars доступна только внутри Telegram',
    };
  }

  let intent: PaymentIntentResult;
  try {
    intent = await input.createIntent();
  } catch {
    return {
      phase: 'failed',
      message: 'не удалось создать платёж, попробуй позже',
    };
  }

  if (intent.nextAction === 'PROVIDER_DISABLED') {
    return {
      phase: 'failed',
      message: intent.message || 'оплата Stars временно недоступна',
    };
  }

  if (intent.nextAction !== 'OPEN_INVOICE' || !intent.invoiceUrl) {
    return {
      phase: 'failed',
      message: intent.message || 'способ оплаты подключается',
      paymentId: intent.paymentId,
    };
  }

  const closeStatus = await openTelegramStarsInvoice(intent.invoiceUrl);

  if (closeStatus === 'cancelled') {
    return {
      phase: 'cancelled',
      message: 'оплата отменена',
      paymentId: intent.paymentId,
    };
  }

  if (closeStatus === 'failed') {
    return {
      phase: 'failed',
      message: 'не удалось завершить оплату',
      paymentId: intent.paymentId,
    };
  }

  const poll = await input.pollStatus(intent.paymentId);

  if (poll.kind === 'activated') {
    return {
      phase: 'success',
      message: '98+ premium активирован',
      paymentId: intent.paymentId,
      expiresAt: poll.expiresAt,
    };
  }

  if (poll.kind === 'failed') {
    return {
      phase: 'failed',
      message: poll.message,
      paymentId: intent.paymentId,
    };
  }

  return {
    phase: 'pending_activation',
    message:
      'оплата получена, доступ активируется — обнови профиль через минуту',
    paymentId: intent.paymentId,
  };
}
