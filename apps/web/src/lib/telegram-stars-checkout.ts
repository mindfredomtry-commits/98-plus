import type { PaymentIntentResult } from '@98plus/shared';
import { pollPaymentActivation, type PaymentPollResult } from './poll-payment-status';

export type InvoiceCloseStatus =
  | 'paid'
  | 'cancelled'
  | 'failed'
  | 'pending'
  | string;

/**
 * Telegram Stars invoice links have the exact shape `https://t.me/$<slug>`.
 * API already returns the openInvoice-compatible host; WEB must not rewrite it.
 */
const TELEGRAM_STARS_INVOICE_URL_RE = /^https:\/\/t\.me\/\$(.+)$/;

export function isTelegramStarsInvoiceUrl(url: string | undefined): boolean {
  return Boolean(url) && TELEGRAM_STARS_INVOICE_URL_RE.test(url as string);
}

/** Hostname only — never logs the slug or the full invoice URL. */
function safeInvoiceHost(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return '(unparseable)';
  }
}

export function hasTelegramOpenInvoice(): boolean {
  if (typeof window === 'undefined') return false;
  const openInvoice = (
    window.Telegram?.WebApp as { openInvoice?: unknown } | undefined
  )?.openInvoice;
  return typeof openInvoice === 'function';
}

/**
 * Opens Telegram Stars invoice. Callback is UX-only — never activates Premium.
 * `invoiceUrl` is forwarded to `openInvoice` unchanged.
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
    } catch (error) {
      console.error('[telegram-stars] openInvoice failed', {
        name: error instanceof Error ? error.name : 'unknown',
        message: error instanceof Error ? error.message : String(error),
        invoiceHost: safeInvoiceHost(invoiceUrl),
      });
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

  const invoiceUrl = intent.invoiceUrl.trim();

  if (!isTelegramStarsInvoiceUrl(invoiceUrl)) {
    console.error('[telegram-stars] invalid invoice URL format', {
      hasInvoiceUrl: Boolean(invoiceUrl),
      host: safeInvoiceHost(invoiceUrl),
    });
    return {
      phase: 'failed',
      message: 'ссылка на оплату недействительна',
      paymentId: intent.paymentId,
    };
  }

  const closeStatus = await openTelegramStarsInvoice(invoiceUrl);

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
