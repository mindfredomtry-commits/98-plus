import {
  buildShareUrl,
  buildStartParam,
  buildTelegramInviteUrl,
  formatViralBanShareMessage,
  normalizeTelegramBotUsername,
} from '@98plus/shared';
import type { DeepLinkAction } from '@98plus/shared';

  /** Canonical bot username via shared normalizer (rejects legacy wrong names). */
const BOT = normalizeTelegramBotUsername(
  process.env.NEXT_PUBLIC_BOT_USERNAME,
);

type TelegramShareWebApp = {
  openTelegramLink?: (url: string) => void;
  openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
};

function getTelegramWebApp(): TelegramShareWebApp | undefined {
  return window.Telegram?.WebApp as TelegramShareWebApp | undefined;
}

/** Telegram share — text only (link lives in message body, no preview duplicate). */
export function telegramShareUrl(shareText: string): string {
  return `https://t.me/share/url?text=${encodeURIComponent(shareText)}`;
}

function copyFallback(text: string): boolean {
  try {
    const clipboard = window.navigator?.clipboard;
    if (!clipboard?.writeText) return false;
    void clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function clickHiddenShareAnchor(link: string): void {
  const doc = window.document;
  const a = doc.createElement('a');
  a.href = link;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.setAttribute('aria-hidden', 'true');
  a.style.cssText =
    'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
  doc.body.appendChild(a);
  a.click();
  window.setTimeout(() => {
    try {
      a.remove();
    } catch {
      /* test mocks / detached nodes */
    }
  }, 200);
}

export type OpenTelegramShareResult =
  | 'openTelegramLink'
  | 'openLink'
  | 'anchor'
  | 'windowOpen'
  | 'copied'
  | 'failed';

/**
 * Open a t.me share/url link inside Telegram Mini App.
 * Prefer openTelegramLink; fall back to openLink / hidden anchor / window.open.
 * window.open alone is often blocked in Telegram WebView → "nothing happens".
 */
export function openTelegramShareLink(link: string): OpenTelegramShareResult {
  const tg = getTelegramWebApp();

  if (tg?.openTelegramLink) {
    try {
      tg.openTelegramLink(link);
      return 'openTelegramLink';
    } catch (err) {
      console.warn('[98+] openTelegramLink failed', err);
    }
  }

  if (tg?.openLink) {
    try {
      tg.openLink(link, { try_instant_view: false });
      return 'openLink';
    } catch (err) {
      console.warn('[98+] openLink failed', err);
    }
  }

  try {
    clickHiddenShareAnchor(link);
    return 'anchor';
  } catch (err) {
    console.warn('[98+] share anchor click failed', err);
  }

  try {
    const opened = window.open(link, '_blank', 'noopener,noreferrer');
    if (opened) return 'windowOpen';
  } catch (err) {
    console.warn('[98+] window.open share failed', err);
  }

  return 'failed';
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
  return openTelegramShareLink(link);
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

export type WhoInviteFinalOutcome = 'opened' | 'copied' | 'failed';

export type WhoInviteMoreDiag = {
  username: string | null;
  shareMethod: OpenTelegramShareResult;
  linkPreview: string;
  /** Human-readable share body (message + bot link) for clipboard recovery. */
  shareText: string;
  /** Primary API used before any clipboard recovery. */
  primaryMethod: OpenTelegramShareResult | 'none';
  fallbackUsed: boolean;
  finalOutcome: WhoInviteFinalOutcome;
};

function buildInviteMoreShareText(username: string | null): {
  link: string;
  shareText: string;
} {
  if (username) {
    const startParam = buildStartParam({ type: 'invite', username });
    const link = buildShareUrl(BOT, startParam, INSTANT_BAN_INVITE_MORE_MESSAGE);
    const botStart = buildTelegramInviteUrl(startParam, BOT);
    return {
      link,
      shareText: `${INSTANT_BAN_INVITE_MORE_MESSAGE}\n\n${botStart}`,
    };
  }
  const botLink = `https://t.me/${BOT}`;
  const shareText = `${INSTANT_BAN_INVITE_MORE_MESSAGE}\n\n${botLink}`;
  return { link: telegramShareUrl(shareText), shareText };
}

/**
 * WhoScreen — invite more people into your ban circle (Telegram share picker).
 * Never fails silently: on open failure attempts clipboard copy.
 */
export function shareInstantBanInviteMore(
  username: string | null | undefined,
): WhoInviteMoreDiag {
  const clean = username?.replace('@', '').trim() || null;
  const { link, shareText } = buildInviteMoreShareText(clean);
  const shareMethod = openTelegramShareLink(link);
  const opened =
    shareMethod === 'openTelegramLink' ||
    shareMethod === 'openLink' ||
    shareMethod === 'anchor' ||
    shareMethod === 'windowOpen';

  if (opened) {
    return {
      username: clean,
      shareMethod,
      linkPreview: link.slice(0, 120),
      shareText,
      primaryMethod: shareMethod,
      fallbackUsed: shareMethod !== 'openTelegramLink',
      finalOutcome: 'opened',
    };
  }

  try {
    const copied = copyFallback(shareText);
    if (copied) {
      return {
        username: clean,
        shareMethod: 'copied',
        linkPreview: link.slice(0, 120),
        shareText,
        primaryMethod: shareMethod,
        fallbackUsed: true,
        finalOutcome: 'copied',
      };
    }
  } catch {
    /* fall through to failed */
  }

  return {
    username: clean,
    shareMethod: 'failed',
    linkPreview: link.slice(0, 120),
    shareText,
    primaryMethod: shareMethod,
    fallbackUsed: true,
    finalOutcome: 'failed',
  };
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
    const method = openTelegramShareLink(link);
    if (method === 'openTelegramLink' || method === 'openLink' || method === 'anchor' || method === 'windowOpen') {
      fallback = window.setTimeout(() => finish('shared'), 120_000);
    } else if (method === 'failed') {
      copyFallback(shareText);
      finish('copied');
    } else {
      copyFallback(shareText);
      finish('copied');
    }
  });
}
