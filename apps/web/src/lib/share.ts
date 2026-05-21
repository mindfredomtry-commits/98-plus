import { buildShareUrl, buildStartParam } from '@98plus/shared';
import type { DeepLinkAction } from '@98plus/shared';

const BOT =
  process.env.NEXT_PUBLIC_BOT_USERNAME?.replace('@', '') ?? 'ninety8plus_bot';

function getTelegramWebApp() {
  return window.Telegram?.WebApp as
    | { openTelegramLink?: (url: string) => void }
    | undefined;
}

/** Telegram-only share URL (opens in-app chat picker, not OS sheet) */
function telegramShareUrl(shareText: string, shareUrl: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`;
}

function copyFallback(text: string) {
  void navigator.clipboard?.writeText(text);
}

/** Share result / deep links — Telegram only */
export function shareDeepLink(action: DeepLinkAction, text: string) {
  const startParam = buildStartParam(action);
  const url = buildShareUrl(BOT, startParam, text);
  const tg = getTelegramWebApp();

  if (tg?.openTelegramLink) {
    tg.openTelegramLink(telegramShareUrl(text, url));
    return;
  }

  copyFallback(`${text}\n\n${url}`);
}

/**
 * Send challenge via Telegram's native share (t.me/share/url).
 * Never uses navigator.share or OS pickers.
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

    const tg = getTelegramWebApp();
    const link = telegramShareUrl(shareText, shareUrl);

    if (tg?.openTelegramLink) {
      document.addEventListener('visibilitychange', onVisible);
      tg.openTelegramLink(link);
      fallback = window.setTimeout(() => finish('shared'), 120_000);
      return;
    }

    copyFallback(shareText);
    finish('copied');
  });
}
