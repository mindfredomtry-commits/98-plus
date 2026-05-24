/** Direct Telegram Bot API calls (works even when Telegraf polling is down). */

export interface TelegramApiResponse {
  ok: boolean;
  result?: { message_id: number };
  error_code?: number;
  description?: string;
}

export function getTelegramBotToken(): string | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  return token || null;
}

export function formatTelegramApiError(e: unknown): {
  code?: number;
  message: string;
} {
  if (e && typeof e === 'object') {
    const r = e as {
      response?: { error_code?: number; description?: string };
      on?: { payload?: { error_code?: number; description?: string } };
      message?: string;
      description?: string;
      error_code?: number;
    };
    const code =
      r.response?.error_code ??
      r.on?.payload?.error_code ??
      r.error_code;
    const message =
      r.response?.description ??
      r.on?.payload?.description ??
      r.description ??
      r.message;
    if (message) return { code, message };
  }
  if (e instanceof Error) return { message: e.message };
  return { message: String(e) };
}

export async function telegramSendMessage(params: {
  chatId: string;
  text: string;
  replyMarkup?: unknown;
}): Promise<TelegramApiResponse> {
  const token = getTelegramBotToken();
  if (!token) {
    return { ok: false, description: 'TELEGRAM_BOT_TOKEN not set' };
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: params.chatId,
          text: params.text,
          ...(params.replyMarkup ? { reply_markup: params.replyMarkup } : {}),
        }),
      },
    );
    const data = (await res.json()) as TelegramApiResponse;
    return data;
  } catch (e) {
    const { code, message } = formatTelegramApiError(e);
    return { ok: false, error_code: code, description: message };
  }
}
