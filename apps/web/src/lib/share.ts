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

/** Telegram share — text only (link lives in message body, no preview duplicate). */
export function telegramShareUrl(shareText: string): string {
  return `https://t.me/share/url?text=${encodeURIComponent(shareText)}`;
}

function copyFallback(text: string) {
  void navigator.clipboard?.writeText(text);
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
 * Open Telegram share dialog with viral ban copy (link once, at bottom).
 */
export function handleShareChallenge(
  banText: string,
  durationMinutes: number,
  shareUrl: string,
): Promise<'shared' | 'copied'> {
  const text = formatViralBanShareMessage({
    banText,
    durationMinutes,
    link: shareUrl,
  });
  return shareChallengeAndWait(text);
}

/** Share result / deep links — Telegram only */
export function shareDeepLink(action: DeepLinkAction, text: string) {
  const startParam = buildStartParam(action);
  const link = buildShareUrl(BOT, startParam, text);
  openTelegramShareLink(link);
}

export const LOBBY_ASK_SHARE_MESSAGE = '🚫 Запретите мне это в 98+';

/** Lobby low-influence CTA — ask friends to ban via invite deep link. */
export function shareLobbyAskInvite(username: string | null | undefined): void {
  const clean = username?.replace('@', '').trim();
  if (clean) {
    shareDeepLink({ type: 'invite', username: clean }, LOBBY_ASK_SHARE_MESSAGE);
    return;
  }
  const botLink = `https://t.me/${BOT}`;
  openTelegramShareLink(
    telegramShareUrl(`${LOBBY_ASK_SHARE_MESSAGE}\n\n${botLink}`),
  );
}

export const INSTANT_BAN_INVITE_MORE_MESSAGE =
  'Заходи в 98+ — будем запрещать друг другу';

/** WhoScreen — invite more people into your ban circle. */
export function shareInstantBanInviteMore(
  username: string | null | undefined,
): void {
  const clean = username?.replace('@', '').trim();
  if (clean) {
    shareDeepLink(
      { type: 'invite', username: clean },
      INSTANT_BAN_INVITE_MORE_MESSAGE,
    );
    return;
  }
  const botLink = `https://t.me/${BOT}`;
  openTelegramShareLink(
    telegramShareUrl(`${INSTANT_BAN_INVITE_MORE_MESSAGE}\n\n${botLink}`),
  );
}

/**
 * Opens Telegram native share. Resolves when user returns to Mini App
 * or share/copy completes (best-effort — Telegram has no share callback).
 */
export function shareChallengeAndWait(
  shareText: string,
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

    const link = telegramShareUrl(shareText);
    const tg = getTelegramWebApp();
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(link);
      fallback = window.setTimeout(() => finish('shared'), 120_000);
    } else {
      copyFallback(shareText);
      finish('copied');
    }
  });
}
