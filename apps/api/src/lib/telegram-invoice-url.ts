/**
 * Strict Telegram Stars invoice-link canonization.
 *
 * Bot API createInvoiceLink may return https://telegram.me/$<slug>, but
 * Telegram.WebApp.openInvoice only accepts https://t.me/$<slug>.
 * This is NOT a general Telegram URL normalizer — only invoice `$` links.
 */

export class TelegramStarsInvoiceUrlError extends Error {
  constructor(message = 'Invalid Telegram invoice URL') {
    super(message);
    this.name = 'TelegramStarsInvoiceUrlError';
  }
}

/** Safe hostname extraction for diagnostics — never logs the slug. */
export function safeTelegramInvoiceHost(
  url: string | null | undefined,
): string | null {
  if (typeof url !== 'string' || !url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return '(unparseable)';
  }
}

export function telegramInvoiceUrlHasSlug(
  url: string | null | undefined,
): boolean {
  if (typeof url !== 'string' || !url) return false;
  try {
    const parsed = new URL(url);
    return parsed.pathname.startsWith('/$') && parsed.pathname.length > 2;
  } catch {
    return false;
  }
}

/**
 * Canonical form for openInvoice: https://t.me/$<slug>
 * Accepts raw Bot API hosts t.me and telegram.me only.
 */
export function canonicalizeTelegramInvoiceUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new TelegramStarsInvoiceUrlError('Invalid Telegram invoice URL');
  }

  const validHost =
    url.hostname === 't.me' || url.hostname === 'telegram.me';

  const validSlug =
    url.pathname.startsWith('/$') && url.pathname.length > 2;

  if (
    url.protocol !== 'https:' ||
    !validHost ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !validSlug
  ) {
    throw new TelegramStarsInvoiceUrlError('Invalid Telegram invoice URL');
  }

  // Rebuild with t.me only — pathname (slug) is taken verbatim, not re-encoded.
  return `https://t.me${url.pathname}`;
}
