/**
 * Telegram Mini App helpers for production WHO native first-contact picker.
 * Uses savePreparedKeyboardButton id + WebApp.requestChat when available.
 */

export type TelegramWebAppPicker = {
  requestChat?: (id: string, cb?: (ok: boolean) => void) => void;
  openTelegramLink?: (url: string) => void;
  openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
  version?: string;
  platform?: string;
  isVersionAtLeast?: (v: string) => boolean;
};

export function getTelegramWebAppPicker(): TelegramWebAppPicker | undefined {
  return (
    window as Window & {
      Telegram?: { WebApp?: TelegramWebAppPicker };
    }
  ).Telegram?.WebApp;
}

/** Telegram added requestChat for prepared request_users around Bot API / WebApp 9.6+. */
export function supportsNativeRequestChat(
  tg: TelegramWebAppPicker | undefined = getTelegramWebAppPicker(),
): boolean {
  if (!tg || typeof tg.requestChat !== 'function') return false;
  if (typeof tg.isVersionAtLeast === 'function') {
    return tg.isVersionAtLeast('9.6');
  }
  return true;
}

export function pickerAnalyticsBase(
  tg: TelegramWebAppPicker | undefined = getTelegramWebAppPicker(),
): Record<string, unknown> {
  return {
    platform: tg?.platform ?? 'unknown',
    webapp_version: tg?.version ?? 'unknown',
  };
}

export type WhoFirstContactClientResult = {
  requestId: string;
  token: string;
  status: 'registered' | 'unregistered' | 'cancelled' | 'expired' | 'error';
  friend?: unknown;
  selectedTelegramId?: string | null;
  selectedFirstName?: string | null;
  selectedLastName?: string | null;
  selectedUsername?: string | null;
  errorMessage?: string | null;
  source: 'ws' | 'consume' | 'poll';
};

export type WhoFirstContactBeginResponse = {
  requestId: string;
  token: string;
  telegramRequestId: number;
  preparedId: string | null;
  botPickStartUrl: string;
  expiresAt: string;
  modeHint: 'prepared' | 'bot_keyboard';
};
