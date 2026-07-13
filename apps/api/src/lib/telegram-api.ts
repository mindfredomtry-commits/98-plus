/** Direct Telegram Bot API calls (works even when Telegraf polling is down). */

export interface TelegramApiResponse<T = { message_id: number }> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
}

type FetchLike = typeof fetch;

let fetchImpl: FetchLike = fetch;

/** Test-only override for Bot API fetch. */
export function setTelegramApiFetchForTests(impl: FetchLike | null): void {
  fetchImpl = impl ?? fetch;
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

export async function telegramBotApiCall<T>(
  method: string,
  body: Record<string, unknown>,
): Promise<TelegramApiResponse<T>> {
  const token = getTelegramBotToken();
  if (!token) {
    return { ok: false, description: 'TELEGRAM_BOT_TOKEN not set' };
  }

  try {
    const res = await fetchImpl(
      `https://api.telegram.org/bot${token}/${method}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    return (await res.json()) as TelegramApiResponse<T>;
  } catch (e) {
    const { code, message } = formatTelegramApiError(e);
    return { ok: false, error_code: code, description: message };
  }
}

export interface TelegramLabeledPrice {
  label: string;
  amount: number;
}

export async function telegramCreateInvoiceLink(params: {
  title: string;
  description: string;
  payload: string;
  currency: string;
  prices: TelegramLabeledPrice[];
}): Promise<TelegramApiResponse<string>> {
  return telegramBotApiCall<string>('createInvoiceLink', {
    title: params.title,
    description: params.description,
    payload: params.payload,
    currency: params.currency,
    prices: params.prices,
  });
}

export async function telegramAnswerPreCheckoutQuery(params: {
  preCheckoutQueryId: string;
  ok: boolean;
  errorMessage?: string;
}): Promise<TelegramApiResponse<boolean>> {
  return telegramBotApiCall<boolean>('answerPreCheckoutQuery', {
    pre_checkout_query_id: params.preCheckoutQueryId,
    ok: params.ok,
    ...(params.ok ? {} : { error_message: params.errorMessage }),
  });
}

export async function telegramSendMessage(params: {
  chatId: string;
  text: string;
  replyMarkup?: unknown;
}): Promise<TelegramApiResponse<{ message_id: number }>> {
  return telegramBotApiCall<{ message_id: number }>('sendMessage', {
    chat_id: params.chatId,
    text: params.text,
    ...(params.replyMarkup ? { reply_markup: params.replyMarkup } : {}),
  });
}
