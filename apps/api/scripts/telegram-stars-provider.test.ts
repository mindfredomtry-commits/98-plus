/**
 * Provider-layer Stars invoice URL canonization tests.
 *
 * Run: npm run test:telegram-stars-provider -w @98plus/api
 */
import assert from 'node:assert/strict';
import {
  canonicalizeTelegramInvoiceUrl,
  TelegramStarsInvoiceUrlError,
} from '../src/lib/telegram-invoice-url';
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

function enableStarsEnv(): void {
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  process.env.TELEGRAM_STARS_ENABLED = 'true';
}

function testCanonicalizeUnit(): void {
  assert.equal(
    canonicalizeTelegramInvoiceUrl('https://t.me/$test_slug'),
    'https://t.me/$test_slug',
  );
  assert.equal(
    canonicalizeTelegramInvoiceUrl('https://telegram.me/$test_slug'),
    'https://t.me/$test_slug',
  );
  // Byte-identical slug path after host swap.
  assert.equal(
    canonicalizeTelegramInvoiceUrl('https://telegram.me/$AbC_12-xy'),
    'https://t.me/$AbC_12-xy',
  );

  const invalid = [
    'http://t.me/$test_slug',
    'https://telegram.dog/$test_slug',
    'https://t.me/BotFather',
    'https://telegram.me/BotFather',
    'https://t.me/$',
    'https://t.me/$test_slug?x=1',
    'https://t.me/$test_slug#h',
    'https://user:pass@t.me/$test_slug',
    'https://t.me:8443/$test_slug',
    'not-a-url',
  ];
  for (const raw of invalid) {
    assert.throws(
      () => canonicalizeTelegramInvoiceUrl(raw),
      TelegramStarsInvoiceUrlError,
      `must reject ${raw}`,
    );
  }
}

async function testProviderPreservesTMe(): Promise<void> {
  enableStarsEnv();
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
  assert.ok(!String(providerResult.invoiceUrl).includes('telegram.me'));
}

async function testProviderCanonicalizesTelegramMe(): Promise<void> {
  enableStarsEnv();
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
  assert.equal(providerResult.invoiceUrl, 'https://t.me/$test_slug');
  assert.ok(!String(providerResult.invoiceUrl).includes('telegram.me'));
}

async function testProviderRejectsInvalidUrl(): Promise<void> {
  enableStarsEnv();
  mockInvoiceResult('https://t.me/BotFather');

  const providerResult = await createTelegramStarsInvoice({
    paymentId: 'pay_bad',
    amount: 1,
    currency: 'XTR',
    productCode: 'premium_1m',
    productTitle: '1 месяц',
  });

  assert.equal(providerResult.nextAction, 'NOT_CONFIGURED');
  assert.equal(providerResult.status, 'CREATED');
  assert.equal(providerResult.invoiceUrl, undefined);
  assert.ok(
    providerResult.message?.includes('Не удалось открыть оплату'),
  );
}

async function main(): Promise<void> {
  try {
    testCanonicalizeUnit();
    await testProviderPreservesTMe();
    await testProviderCanonicalizesTelegramMe();
    await testProviderRejectsInvalidUrl();
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
