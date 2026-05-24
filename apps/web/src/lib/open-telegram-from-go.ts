/**
 * Opens 98+ bot from TikTok/Instagram in-app browsers.
 * Only uses tg:// and t.me — never auth or external login URLs.
 */

const BOT_DOMAIN =
  process.env.NEXT_PUBLIC_BOT_USERNAME?.replace('@', '') ??
  'Ninety_eight_pluss_Bot';

const START_PARAM = 'invite';

export const GO_TG_DEEP_LINK = `tg://resolve?domain=${BOT_DOMAIN}&start=${START_PARAM}`;
export const GO_WEB_FALLBACK = `https://t.me/${BOT_DOMAIN}?start=${START_PARAM}`;
export const GO_ANDROID_INTENT = `intent://resolve?domain=${BOT_DOMAIN}&start=${START_PARAM}#Intent;scheme=tg;package=org.telegram.messenger;end`;

const FALLBACK_DELAY_MS = 1200;

let attemptSeq = 0;
let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
let androidIntentTimer: ReturnType<typeof setTimeout> | null = null;

function isTelegramUserAgent(): boolean {
  const ua = navigator.userAgent ?? '';
  return /Telegram/i.test(ua);
}

function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent ?? '');
}

function clearTimers() {
  if (fallbackTimer) {
    clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }
  if (androidIntentTimer) {
    clearTimeout(androidIntentTimer);
    androidIntentTimer = null;
  }
}

function clickHiddenAnchor(url: string, anchor?: HTMLAnchorElement | null) {
  if (anchor) {
    anchor.href = url;
    anchor.click();
    return;
  }
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener noreferrer';
  a.setAttribute('aria-hidden', 'true');
  a.style.cssText =
    'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => a.remove(), 200);
}

function tryLocation(url: string) {
  try {
    window.location.assign(url);
  } catch {
    try {
      window.location.href = url;
    } catch {
      /* in-app browser may block */
    }
  }
}

export type GoTelegramAnchors = {
  tg: HTMLAnchorElement | null;
  web: HTMLAnchorElement | null;
  intent: HTMLAnchorElement | null;
};

/**
 * Run every Telegram open method (user tap or hint retry).
 * Cancels in-flight timers from a previous tap.
 */
export function openTelegramFromGo(anchors?: GoTelegramAnchors): void {
  const seq = ++attemptSeq;
  clearTimers();

  if (isTelegramUserAgent()) {
    clickHiddenAnchor(GO_WEB_FALLBACK, anchors?.web);
    tryLocation(GO_WEB_FALLBACK);
    return;
  }

  // 1) Hidden anchor + tg:// deep link
  clickHiddenAnchor(GO_TG_DEEP_LINK, anchors?.tg);
  tryLocation(GO_TG_DEEP_LINK);

  // 2) Android intent (slightly delayed so tg:// gets first shot)
  if (isAndroid()) {
    androidIntentTimer = window.setTimeout(() => {
      if (seq !== attemptSeq) return;
      if (document.visibilityState === 'hidden') return;
      clickHiddenAnchor(GO_ANDROID_INTENT, anchors?.intent);
      tryLocation(GO_ANDROID_INTENT);
    }, 350);
  }

  // 3) https://t.me fallback
  fallbackTimer = window.setTimeout(() => {
    fallbackTimer = null;
    if (seq !== attemptSeq) return;
    if (document.visibilityState === 'hidden') return;

    clickHiddenAnchor(GO_WEB_FALLBACK, anchors?.web);
    tryLocation(GO_WEB_FALLBACK);
  }, FALLBACK_DELAY_MS);
}

/** Cancel pending fallbacks when the OS backgrounds the page (Telegram opened). */
export function bindTelegramOpenVisibilityGuard(): () => void {
  const onVis = () => {
    if (document.visibilityState === 'hidden') {
      clearTimers();
    }
  };
  document.addEventListener('visibilitychange', onVis);
  return () => document.removeEventListener('visibilitychange', onVis);
}
