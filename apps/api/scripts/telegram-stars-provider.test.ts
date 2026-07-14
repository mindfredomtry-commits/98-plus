/**
 * Provider-layer Stars invoice URL passthrough tests.
 *
 * Run: npx tsx apps/api/scripts/telegram-stars-provider.test.ts
 *
 * Proves TelegramStarsProvider / createTelegramStarsInvoice forward the raw
 * Bot API createInvoiceLink `result` without rewriting t.me ↔ telegram.me.
 */
import assert from 'node:assert/strict';
import { setTelegramApiFetchForTests } from '../src/lib/telegram-api';
import { TelegramStarsProvider } from '../src/services/payment-adapters';
import { createTelegramStarsInvoice } from '../src/services/telegram-stars-payment.service';

function mockInvoiceResult(resultUrl: string): void {
  setTelegramApiFetchForTests(async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<
      string,
      unknown
    >;
    if (body.title) {
      return new Response(JSON.stringify({ ok: true, result: resultUrl }), {
        status: 200,
      });
    }
    return new Response(JSON.stringify({ ok: true, result: true }), {
      status: 200,
    });
  });
}

async function testPreservesTMeFromBotApi(): Promise<void> {
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  process.env.TELEGRAM_STARS_ENABLED = 'true';
  mockInvoiceResult('https://t.me/$test_slug');

  const provider = new TelegramStarsProvider();
  const providerResult = await provider.createPayment({
    paymentId: 'pay_tme',
    amount: 1,
    currency: 'XTR',
    externalProductId: null,
    productCode: 'premium_1m',
    productTitle: '1 месяц',
  });

  assert.equal(providerResult.nextAction, 'OPEN_INVOICE');
  assert.equal(providerResult.invoiceUrl, 'https://t.me/$test_slug');
  assert.ok(
    !String(providerResult.invoiceUrl).includes('telegram.me'),
    'adapter must not rewrite t.me → telegram.me',
  );

  const direct = await createTelegramStarsInvoice({
    paymentId: 'pay_tme_direct',
    amount: 1,
    currency: 'XTR',
    productCode: 'premium_1m',
    productTitle: '1 месяц',
  });
  assert.equal(direct.invoiceUrl, 'https://t.me/$test_slug');
}

async function testPreservesTelegramMeFromBotApiRaw(): Promise<void> {
  // If Bot API itself returns telegram.me, adapter must pass it through unchanged.
  // This does NOT make telegram.me valid for WEB openInvoice — only proves source.
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  process.env.TELEGRAM_STARS_ENABLED = 'true';
  mockInvoiceResult('https://telegram.me/$test_slug');

  const provider = new TelegramStarsProvider();
  const providerResult = await provider.createPayment({
    paymentId: 'pay_tgme',
    amount: 1,
    currency: 'XTR',
    externalProductId: null,
    productCode: 'premium_1m',
    productTitle: '1 месяц',
  });

  assert.equal(providerResult.nextAction, 'OPEN_INVOICE');
  assert.equal(
    providerResult.invoiceUrl,
    'https://telegram.me/$test_slug',
    'adapter must return raw Bot API result without rewriting',
  );
  assert.ok(
    !String(providerResult.invoiceUrl).includes('https://t.me/'),
    'adapter must not rewrite telegram.me → t.me either',
  );
}

async function main(): Promise<void> {
  try {
    await testPreservesTMeFromBotApi();
    await testPreservesTelegramMeFromBotApiRaw();
    console.log('[telegram-stars-provider.test] all checks passed');
  } finally {
    setTelegramApiFetchForTests(null);
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_STARS_ENABLED;
  }
}

main().catch((e) => {
  console.error('[telegram-stars-provider.test] failed', e);
  process.exitCode = 1;
});
