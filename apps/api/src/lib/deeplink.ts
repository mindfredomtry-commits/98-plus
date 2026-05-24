import {
  buildBotStartUrl,
  buildMiniAppUrl,
  buildShareUrl,
  buildStartParam,
  type DeepLinkAction,
} from '@98plus/shared';

export { buildBotStartUrl };

export function botUsername(): string {
  return (
    process.env.TELEGRAM_BOT_USERNAME ??
    process.env.NEXT_PUBLIC_BOT_USERNAME ??
    'ninety8plus_bot'
  );
}

export function miniAppLink(action: DeepLinkAction): string {
  const base =
    process.env.WEBAPP_URL?.trim() ||
    process.env.CORS_ORIGIN?.trim() ||
    'https://arrow-scott-pursuit-incentive.trycloudflare.com';

  const clean = base.replace(/\/$/, '');
  const param = buildStartParam(action);

  return `${clean}/?startapp=${encodeURIComponent(param)}`;
}

export function shareLink(action: DeepLinkAction, text: string): string {
  return buildShareUrl(botUsername(), buildStartParam(action), text);
}

/** Viral invite — opens bot /start first (not Mini App). */
export function inviteLinkForUser(username: string | null): string | null {
  if (!username) return null;
  return buildBotStartUrl(
    botUsername(),
    buildStartParam({ type: 'invite', username }),
  );
}
