/**
 * Run: npm run test:telegram-stars -w @98plus/api
 */
import assert from 'node:assert/strict';
import {
  buildTelegramStarsInvoicePayload,
  parseTelegramStarsInvoicePayload,
} from '../src/config/telegram-stars';
import { setTelegramApiFetchForTests } from '../src/lib/telegram-api';
import {
  createTelegramStarsInvoice,
  buildPaySupportMessage,
} from '../src/services/telegram-stars-payment.service';

async function main(): Promise<void> {
  const sampleId = 'clpay123456789';
  assert.equal(
    buildTelegramStarsInvoicePayload(sampleId),
    `98plus:${sampleId}`,
  );
  assert.equal(
    parseTelegramStarsInvoicePayload(`98plus:${sampleId}`),
    sampleId,
  );
  assert.equal(parseTelegramStarsInvoicePayload('bad'), null);

  let lastInvoiceBody: Record<string, unknown> | null = null;
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  process.env.TELEGRAM_STARS_ENABLED = 'true';

  setTelegramApiFetchForTests(async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<
      string,
      unknown
    >;
    if (body.title) {
      lastInvoiceBody = body;
      return new Response(
        JSON.stringify({ ok: true, result: 'https://t.me/$invoice_test' }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ ok: true, result: true }), {
      status: 200,
    });
  });

  const invoiceResult = await createTelegramStarsInvoice({
    paymentId: sampleId,
    amount: 300,
    currency: 'XTR',
    productCode: 'premium_1m',
    productTitle: '1 месяц',
  });

  assert.equal(invoiceResult.nextAction, 'OPEN_INVOICE');
  assert.equal(invoiceResult.invoiceUrl, 'https://t.me/$invoice_test');
  assert.ok(lastInvoiceBody);
  assert.equal(lastInvoiceBody!.currency, 'XTR');
  assert.deepEqual(lastInvoiceBody!.prices, [
    { label: '98+ premium · 1 месяц', amount: 300 },
  ]);
  assert.equal(
    lastInvoiceBody!.payload,
    buildTelegramStarsInvoicePayload(sampleId),
  );
  assert.equal('provider_token' in (lastInvoiceBody ?? {}), false);

  const support = buildPaySupportMessage();
  assert.ok(support.includes('Поддержка по оплате'));
  assert.ok(!support.includes('test-token'));

  console.log('[telegram-stars.test] unit checks passed');

  setTelegramApiFetchForTests(null);
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_STARS_ENABLED;
}

main().catch((e) => {
  console.error('[telegram-stars.test] failed', e);
  process.exitCode = 1;
});
