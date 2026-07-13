import { getTelegramBotToken } from '../src/lib/telegram-api';

type WebhookInfo = {
  url: string;
  has_custom_certificate: boolean;
  pending_update_count: number;
  last_error_date?: number;
  last_error_message?: string;
  max_connections?: number;
  allowed_updates?: string[];
};

async function main(): Promise<void> {
  const token = getTelegramBotToken();
  if (!token) {
    console.error('[check-bot-webhook] TELEGRAM_BOT_TOKEN not configured');
    process.exitCode = 1;
    return;
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  const body = (await res.json()) as {
    ok: boolean;
    result?: WebhookInfo;
    description?: string;
  };

  if (!body.ok || !body.result) {
    console.error('[check-bot-webhook] getWebhookInfo failed', {
      ok: body.ok,
      description: body.description ?? 'unknown',
    });
    process.exitCode = 1;
    return;
  }

  const info = body.result;
  const webhookActive = Boolean(info.url?.trim());

  console.log('[check-bot-webhook]', {
    webhookActive,
    urlConfigured: webhookActive,
    urlHost: webhookActive ? safeHost(info.url) : null,
    pendingUpdateCount: info.pending_update_count,
    hasCustomCertificate: info.has_custom_certificate,
    lastErrorMessage: info.last_error_message ?? null,
    allowedUpdates: info.allowed_updates ?? null,
    pollingExpected: !webhookActive,
  });
}

function safeHost(raw: string): string | null {
  try {
    return new URL(raw).host;
  } catch {
    return '(invalid-url)';
  }
}

main().catch((e) => {
  console.error('[check-bot-webhook] failed', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
