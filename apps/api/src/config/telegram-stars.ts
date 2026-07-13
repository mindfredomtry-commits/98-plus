import { getTelegramBotToken } from '../lib/telegram-api';

export const TELEGRAM_STARS_INVOICE_PAYLOAD_PREFIX = '98plus:';

/** Payment intents expire after this many hours if not completed. */
export const TELEGRAM_STARS_PAYMENT_TTL_HOURS = 24;

export function isTelegramStarsEnabled(): boolean {
  return (
    process.env.TELEGRAM_STARS_ENABLED === 'true' &&
    Boolean(getTelegramBotToken())
  );
}

export function isTelegramStarsTestMode(): boolean {
  return process.env.TELEGRAM_STARS_TEST_MODE === 'true';
}

export function telegramStarsInvoiceTitle(): string {
  return (
    process.env.TELEGRAM_STARS_INVOICE_TITLE?.trim() || '98+ premium'
  );
}

export function telegramStarsInvoiceDescription(): string {
  return (
    process.env.TELEGRAM_STARS_INVOICE_DESCRIPTION?.trim() ||
    'Разовая покупка доступа 98+ premium'
  );
}

export function paymentSupportContact(): string | null {
  const raw = process.env.PAYMENT_SUPPORT_CONTACT?.trim();
  return raw || null;
}

export function buildTelegramStarsInvoicePayload(paymentId: string): string {
  return `${TELEGRAM_STARS_INVOICE_PAYLOAD_PREFIX}${paymentId}`;
}

export function parseTelegramStarsInvoicePayload(
  payload: string,
): string | null {
  if (!payload.startsWith(TELEGRAM_STARS_INVOICE_PAYLOAD_PREFIX)) {
    return null;
  }
  const paymentId = payload.slice(
    TELEGRAM_STARS_INVOICE_PAYLOAD_PREFIX.length,
  );
  return paymentId.length > 0 ? paymentId : null;
}

export function telegramStarsPriceLabel(productTitle: string): string {
  return `98+ premium · ${productTitle}`;
}
