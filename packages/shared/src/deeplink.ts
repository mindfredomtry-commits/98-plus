import {
  buildReplyStartParam,
  parseReplyStartParamRest,
  type ReplyStartParamPreview,
} from './reply-preview';
import {
  TELEGRAM_BOT_USERNAME,
  TELEGRAM_BOT_USERNAME_LEGACY_REJECTED,
} from './constants';

export type DeepLinkAction =
  | { type: 'invite'; username: string }
  | { type: 'invite_token'; token: string }
  | { type: 'invite_to_ban'; inviterId: string }
  | { type: 'repeat_ban_from_invite'; banId: string }
  | { type: 'result'; banId: string }
  | { type: 'repeat'; banId: string }
  | { type: 'check'; banId: string }
  | { type: 'ban'; banId: string }
  | { type: 'reply'; banId: string; preview?: ReplyStartParamPreview }
  | { type: 'active'; banId: string };

export type { ReplyStartParamPreview };

const LEGACY_REJECTED = new Set(
  TELEGRAM_BOT_USERNAME_LEGACY_REJECTED.map((u) => u.toLowerCase()),
);

/**
 * Resolve bot username for t.me links.
 * Strips leading @, preserves casing/underscores, never emits legacy wrong names.
 */
export function normalizeTelegramBotUsername(
  raw?: string | null,
): string {
  const cleaned = (raw ?? '').replace(/^@+/, '').trim();
  if (!cleaned || LEGACY_REJECTED.has(cleaned.toLowerCase())) {
    return TELEGRAM_BOT_USERNAME;
  }
  return cleaned;
}

/**
 * Bot /start invite URL — canonical BotFather username + encoded payload.
 *
 * buildTelegramInviteUrl('u_justDim')
 * → https://t.me/Ninety_eight_pluss_Bot?start=u_justDim
 */
export function buildTelegramInviteUrl(
  startPayload: string,
  botUsername?: string | null,
): string {
  const bot = normalizeTelegramBotUsername(botUsername);
  if (bot.includes('@')) {
    throw new Error('Telegram bot username must not include @ in URL path');
  }
  if (LEGACY_REJECTED.has(bot.toLowerCase())) {
    throw new Error(`Rejected legacy Telegram bot username: ${bot}`);
  }
  return `https://t.me/${bot}?start=${encodeURIComponent(startPayload)}`;
}

/** Read signed start_param from Telegram WebApp initData string */
export function readStartParamFromInitData(initData?: string | null): string | null {
  if (!initData?.trim()) return null;
  const v = new URLSearchParams(initData).get('start_param');
  return v?.trim() || null;
}

/** Telegram start_param (max 64 chars) */
export function parseStartParam(raw?: string | null): DeepLinkAction | null {
  if (!raw?.trim()) return null;
  const p = raw.trim();

  if (p.startsWith('itb_')) {
    const inviterId = p.slice(4).trim();
    return inviterId ? { type: 'invite_to_ban', inviterId } : null;
  }
  if (p.startsWith('rbi_')) {
    const banId = p.slice(4).trim();
    return banId ? { type: 'repeat_ban_from_invite', banId } : null;
  }
  if (p.startsWith('invite_')) {
    const rest = p.slice(7);
    if (rest.length >= 8 && !rest.includes('_')) {
      return { type: 'invite_token', token: rest };
    }
    return { type: 'invite', username: rest.replace('@', '') };
  }
  if (p.startsWith('u_')) {
    return { type: 'invite', username: p.slice(2).replace('@', '') };
  }
  if (p.startsWith('rp_')) {
    return { type: 'repeat', banId: p.slice(3) };
  }
  if (p.startsWith('res_')) {
    return { type: 'result', banId: p.slice(4) };
  }
  if (p.startsWith('rply_')) {
    const parsed = parseReplyStartParamRest(p.slice(5));
    return {
      type: 'reply',
      banId: parsed.banId,
      ...(parsed.preview ? { preview: parsed.preview } : {}),
    };
  }
  if (p.startsWith('r_')) {
    return { type: 'result', banId: p.slice(2) };
  }
  if (p.startsWith('c_')) {
    return { type: 'check', banId: p.slice(2) };
  }
  if (p.startsWith('b_')) {
    return { type: 'ban', banId: p.slice(2) };
  }
  if (p.startsWith('ply_')) {
    const parsed = parseReplyStartParamRest(p.slice(4));
    return {
      type: 'reply',
      banId: parsed.banId,
      ...(parsed.preview ? { preview: parsed.preview } : {}),
    };
  }
  if (p.startsWith('a_')) {
    return { type: 'active', banId: p.slice(2) };
  }
  return null;
}

export function isInviteTokenStartParam(raw?: string | null): boolean {
  return parseStartParam(raw)?.type === 'invite_token';
}

export function buildStartParam(action: DeepLinkAction): string {
  switch (action.type) {
    case 'invite':
      return `u_${action.username.replace('@', '')}`;
    case 'invite_token':
      return `invite_${action.token}`;
    case 'invite_to_ban':
      return `itb_${action.inviterId}`;
    case 'repeat_ban_from_invite':
      return `rbi_${action.banId}`;
    case 'result':
      return `res_${action.banId}`;
    case 'repeat':
      return `rp_${action.banId}`;
    case 'check':
      return `c_${action.banId}`;
    case 'ban':
      return `b_${action.banId}`;
    case 'reply':
      return buildReplyStartParam(action.banId, action.preview);
    case 'active':
      return `a_${action.banId}`;
  }
}

/**
 * Direct HTTPS URL for Telegram inline keyboard `web_app` buttons.
 * Uses tgWebAppStartParam (Telegram WebApp spec) — not t.me/startapp links.
 */
export function buildWebAppDirectUrl(
  webAppBaseUrl: string,
  startParam: string,
): string {
  const base = webAppBaseUrl.replace(/\/$/, '');
  const url = new URL(`${base}/`);
  url.searchParams.set('tgWebAppStartParam', startParam);
  return url.toString();
}

export function buildMiniAppUrl(
  botUsername: string,
  startParam: string,
): string {
  const bot = normalizeTelegramBotUsername(botUsername);
  return `https://t.me/${bot}?startapp=${encodeURIComponent(startParam)}`;
}

/** Opens bot chat with /start payload — works before Mini App */
export function buildBotStartUrl(
  botUsername: string,
  startParam: string,
): string {
  return buildTelegramInviteUrl(startParam, botUsername);
}

/**
 * Telegram native share — viral entry via bot /start (not direct Mini App).
 * Link in message body only (no duplicate url= preview).
 */
export function buildShareUrl(
  botUsername: string,
  startParam: string,
  messageBody: string,
): string {
  const botStart = buildTelegramInviteUrl(startParam, botUsername);
  const shareText = messageBody.trim()
    ? `${messageBody.trim()}\n\n${botStart}`
    : botStart;
  return `https://t.me/share/url?text=${encodeURIComponent(shareText)}`;
}
