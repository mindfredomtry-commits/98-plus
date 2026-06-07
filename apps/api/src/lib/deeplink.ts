import {
  buildBotStartUrl,
  buildShareUrl,
  buildStartParam,
  buildWebAppDirectUrl,
  type DeepLinkAction,
} from '@98plus/shared';

export { buildBotStartUrl };

export type BotWebAppButtonMeta = {
  source: string;
  buttonLabel: string;
};

export function botUsername(): string {
  return (
    process.env.TELEGRAM_BOT_USERNAME ??
    process.env.NEXT_PUBLIC_BOT_USERNAME ??
    'ninety8plus_bot'
  );
}

/** Base URL for inline keyboard web_app buttons — must match BotFather Menu Button. */
export function resolveWebAppBaseUrl(): string {
  const fromEnv = process.env.WEBAPP_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, '');
  }

  const nodeEnv = process.env.NODE_ENV ?? 'development';
  if (nodeEnv === 'production') {
    console.error(
      '[BOT WEBAPP BUTTON] WEBAPP_URL is not set — inline buttons may open a wrong host',
    );
  } else {
    console.warn(
      '[BOT WEBAPP BUTTON] WEBAPP_URL missing — using localhost:3000 for dev',
    );
  }

  return 'http://localhost:3000';
}

function maskWebAppUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const keys = [...parsed.searchParams.keys()];
    for (const key of keys) {
      parsed.searchParams.set(key, '…');
    }
    return parsed.toString();
  } catch {
    return url.replace(/tgWebAppStartParam=[^&]+/g, 'tgWebAppStartParam=…');
  }
}

function banIdFromAction(action: DeepLinkAction): string | undefined {
  if ('banId' in action) return action.banId;
  return undefined;
}

function logBotWebAppButton(params: {
  meta?: BotWebAppButtonMeta;
  deepLinkType: string;
  payload: string | null;
  generatedUrl: string;
  banId?: string;
}): void {
  console.log('[BOT WEBAPP BUTTON]', {
    source: params.meta?.source ?? 'unknown',
    buttonLabel: params.meta?.buttonLabel ?? null,
    deepLinkType: params.deepLinkType,
    payload: params.payload,
    generatedUrl: maskWebAppUrl(params.generatedUrl),
    banId: params.banId ?? null,
    urlKind: 'web_app',
    webAppBase: resolveWebAppBaseUrl(),
  });
}

/** Builds HTTPS Web App URL for Telegram inline keyboard `web_app` buttons. */
export function miniAppLink(
  action: DeepLinkAction,
  meta?: BotWebAppButtonMeta,
): string {
  return botWebAppButtonUrl(action, meta);
}

/**
 * Same as miniAppLink, with debug log for bot notification buttons.
 * Always uses `web_app: { url }` — never t.me url buttons.
 */
export function botWebAppButtonUrl(
  action: DeepLinkAction,
  meta?: BotWebAppButtonMeta,
): string {
  const payload = buildStartParam(action);
  const base = resolveWebAppBaseUrl();
  const url = buildWebAppDirectUrl(base, payload);

  logBotWebAppButton({
    meta,
    deepLinkType: action.type,
    payload,
    generatedUrl: url,
    banId: banIdFromAction(action),
  });

  return url;
}

/** Generic Mini App open — no start_param (lobby). */
export function botWebAppPlainOpenUrl(meta?: BotWebAppButtonMeta): string {
  const base = resolveWebAppBaseUrl();
  const url = `${base}/`;

  logBotWebAppButton({
    meta,
    deepLinkType: 'plain',
    payload: null,
    generatedUrl: url,
  });

  return url;
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
