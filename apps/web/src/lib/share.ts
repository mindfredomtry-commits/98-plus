import {
  buildShareUrl,
  buildStartParam,
  formatViralBanShareMessage,
} from '@98plus/shared';
import type { DeepLinkAction } from '@98plus/shared';

const BOT =
  process.env.NEXT_PUBLIC_BOT_USERNAME?.replace('@', '') ?? 'ninety8plus_bot';

function getTelegramWebApp() {
  return window.Telegram?.WebApp as
    | { openTelegramLink?: (url: string) => void }
    | undefined;
}

/** Telegram-only share URL (opens in-app chat picker, not OS sheet) */
export function telegramShareUrl(shareText: string, shareUrl: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`;
}

function copyFallback(text: string, url: string) {
  void navigator.clipboard?.writeText(`${text}\n\n${url}`);
}

function openTelegramShareLink(link: string) {
  const tg = getTelegramWebApp();
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(link);
    return;
  }
  window.open(link, '_blank', 'noopener,noreferrer');
}

/**
 * Open Telegram share dialog with viral ban copy.
 * Link is passed only via url= param — not duplicated in message body.
 */
export function handleShareChallenge(
  banText: string,
  durationMinutes: number,
  shareUrl: string,
): Promise<'shared' | 'copied'> {
  const text = formatViralBanShareMessage({ banText, durationMinutes });
  return shareChallengeAndWait(text, shareUrl);
}

/** Share result / deep links — Telegram only */
export function shareDeepLink(action: DeepLinkAction, text: string) {
  const startParam = buildStartParam(action);
  const link = buildShareUrl(BOT, startParam, text);
  openTelegramShareLink(link);
}

/**
 * Opens Telegram native share. Resolves when user returns to Mini App
 * or share/copy completes (best-effort — Telegram has no share callback).
 */
export function shareChallengeAndWait(
  shareText: string,
  shareUrl: string,
): Promise<'shared' | 'copied'> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (mode: 'shared' | 'copied') => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(mode);
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        finish('shared');
      }
    };

    let fallback = 0;
    const cleanup = () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.clearTimeout(fallback);
    };

    document.addEventListener('visibilitychange', onVisible);

    const link = telegramShareUrl(shareText, shareUrl);
    const tg = getTelegramWebApp();
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(link);
      fallback = window.setTimeout(() => finish('shared'), 120_000);
    } else {
      copyFallback(shareText, shareUrl);
      finish('copied');
    }
  });
}
