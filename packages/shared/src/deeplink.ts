export type DeepLinkAction =
  | { type: 'invite'; username: string }
  | { type: 'invite_token'; token: string }
  | { type: 'result'; banId: string }
  | { type: 'repeat'; banId: string }
  | { type: 'check'; banId: string }
  | { type: 'ban'; banId: string }
  | { type: 'reply'; banId: string }
  | { type: 'active'; banId: string };

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
    return { type: 'reply', banId: p.slice(4) };
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
    case 'result':
      return `r_${action.banId}`;
    case 'repeat':
      return `rp_${action.banId}`;
    case 'check':
      return `c_${action.banId}`;
    case 'ban':
      return `b_${action.banId}`;
    case 'reply':
      return `ply_${action.banId}`;
    case 'active':
      return `a_${action.banId}`;
  }
}

export function buildMiniAppUrl(
  botUsername: string,
  startParam: string,
): string {
  const bot = botUsername.replace('@', '');
  return `https://t.me/${bot}?startapp=${encodeURIComponent(startParam)}`;
}

/** Opens bot chat with /start payload — works before Mini App */
export function buildBotStartUrl(
  botUsername: string,
  startParam: string,
): string {
  const bot = botUsername.replace('@', '');
  return `https://t.me/${bot}?start=${encodeURIComponent(startParam)}`;
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
  const botStart = buildBotStartUrl(botUsername, startParam);
  const shareText = messageBody.trim()
    ? `${messageBody.trim()}\n\n${botStart}`
    : botStart;
  return `https://t.me/share/url?text=${encodeURIComponent(shareText)}`;
}
