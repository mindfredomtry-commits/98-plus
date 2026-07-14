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
 * The string from the API must be passed to `openInvoice` verbatim — no host
 * canonicalization (e.g. t.me → telegram.me), no `new URL()` rewrite, and no
 * shared Telegram-link normalizer. Any such transform makes telegram-web-app.js
 * reject it with "Invoice url is invalid".
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
  paymentId?: string,
): Promise<InvoiceCloseStatus> {
  return new Promise((resolve) => {
    const webApp = window.Telegram?.WebApp as
      | {
          openInvoice?: (
            url: string,
            callback: (status: InvoiceCloseStatus) => void,
          ) => void;
          version?: string;
          platform?: string;
        }
      | undefined;

    if (!webApp?.openInvoice) {
      resolve('failed');
      return;
    }

    // DIAGNOSTIC: capture the exact string handed to openInvoice in the real
    // browser. Full invoiceUrl is intentionally logged here (Console only) for
    // this one narrow diagnostic step. No token / initData / providerPayload.
    console.log('[STARS_OPEN_INVOICE_INPUT]', {
      invoiceUrl,
      host: safeInvoiceHost(invoiceUrl),
      startsWithTMeInvoice: /^https:\/\/t\.me\/\$.+/.test(invoiceUrl),
      tgVersion: webApp.version ?? null,
      tgPlatform: webApp.platform ?? null,
    });

    try {
      // Pass the exact API string. Do NOT normalize the host here.
      webApp.openInvoice(invoiceUrl, (status) => {
        console.log('[STARS_OPEN_INVOICE_CALLBACK]', {
          status,
          paymentId,
        });
        resolve(status ?? 'failed');
      });
    } catch (error) {
      console.error('[STARS_OPEN_INVOICE_THROW]', {
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

  // DIAGNOSTIC A: first capture of invoiceUrl after invent response —
  // before trim / validator / safeInvoiceHost / openInvoice helpers.
  console.log('[STARS_INTENT_RESPONSE_RAW]', {
    invoiceUrl: intent.invoiceUrl,
    type: typeof intent.invoiceUrl,
    nextAction: intent.nextAction,
    paymentId: intent.paymentId,
  });

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

  // DIAGNOSTIC B: argument about to be handed into checkout/open path —
  // still before trim / isTelegramStarsInvoiceUrl / openTelegramStarsInvoice.
  const invoiceUrl = intent.invoiceUrl;
  console.log('[STARS_CHECKOUT_ARGUMENT]', {
    invoiceUrl,
    type: typeof invoiceUrl,
  });

  const invoiceUrlNormalized = invoiceUrl.trim();

  if (!isTelegramStarsInvoiceUrl(invoiceUrlNormalized)) {
    console.error('[telegram-stars] invalid invoice URL format', {
      hasInvoiceUrl: Boolean(invoiceUrlNormalized),
      host: safeInvoiceHost(invoiceUrlNormalized),
    });
    return {
      phase: 'failed',
      message: 'ссылка на оплату недействительна',
      paymentId: intent.paymentId,
    };
  }

  const closeStatus = await openTelegramStarsInvoice(
    invoiceUrlNormalized,
    intent.paymentId,
  );

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
