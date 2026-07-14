/**
 * Client Stars checkout URL test (no UI).
 *
 * Run: npx tsx apps/web/scripts/telegram-stars-checkout.test.ts
 *
 * API returns canonical https://t.me/$slug — WEB must pass it to openInvoice
 * verbatim. Callback never activates Premium.
 */
import assert from 'node:assert/strict';
import type { PaymentIntentResult } from '@98plus/shared';
import {
  isTelegramStarsInvoiceUrl,
  runTelegramStarsCheckout,
} from '../src/lib/telegram-stars-checkout';
import type { PaymentPollResult } from '../src/lib/poll-payment-status';

type OpenInvoiceCb = (status: string) => void;

function installFakeTelegram(
  callbackStatus: string = 'cancelled',
): { getLastUrl: () => string | null; calls: () => number } {
  let lastUrl: string | null = null;
  let calls = 0;
  (globalThis as unknown as { window: unknown }).window = {
    Telegram: {
      WebApp: {
        openInvoice: (url: string, cb: OpenInvoiceCb) => {
          lastUrl = url;
          calls += 1;
          cb(callbackStatus);
        },
      },
    },
  };
  return { getLastUrl: () => lastUrl, calls: () => calls };
}

function makeIntent(invoiceUrl: string): PaymentIntentResult {
  return {
    paymentId: 'pay_test',
    status: 'PENDING',
    nextAction: 'OPEN_INVOICE',
    invoiceUrl,
  } as PaymentIntentResult;
}

const pendingPoll = async (): Promise<PaymentPollResult> => ({ kind: 'pending' });

async function testOpenInvoiceReceivesCanonicalTMe(): Promise<void> {
  const tg = installFakeTelegram();
  const outcome = await runTelegramStarsCheckout({
    createIntent: async () => makeIntent('https://t.me/$test_slug'),
    pollStatus: pendingPoll,
  });

  assert.equal(tg.calls(), 1);
  assert.equal(tg.getLastUrl(), 'https://t.me/$test_slug');
  assert.ok(!String(tg.getLastUrl()).includes('telegram.me'));
  assert.equal(outcome.phase, 'cancelled');
}

async function testRejectsTelegramMeFromApi(): Promise<void> {
  // WEB validator only accepts t.me — telegram.me must never reach openInvoice.
  const tg = installFakeTelegram();
  const outcome = await runTelegramStarsCheckout({
    createIntent: async () => makeIntent('https://telegram.me/$test_slug'),
    pollStatus: pendingPoll,
  });

  assert.equal(tg.calls(), 0);
  assert.equal(outcome.phase, 'failed');
}

async function testCallbackDoesNotActivatePremium(): Promise<void> {
  const tg = installFakeTelegram('paid');
  const outcome = await runTelegramStarsCheckout({
    createIntent: async () => makeIntent('https://t.me/$test_slug'),
    pollStatus: pendingPoll,
  });

  assert.equal(tg.calls(), 1);
  assert.notEqual(outcome.phase, 'success');
  assert.equal(outcome.phase, 'pending_activation');
}

function testValidator(): void {
  assert.equal(isTelegramStarsInvoiceUrl('https://t.me/$test_slug'), true);
  assert.equal(isTelegramStarsInvoiceUrl('https://telegram.me/$test_slug'), false);
  assert.equal(isTelegramStarsInvoiceUrl('https://t.me/BotFather'), false);
  assert.equal(isTelegramStarsInvoiceUrl(undefined), false);
}

async function main(): Promise<void> {
  testValidator();
  await testOpenInvoiceReceivesCanonicalTMe();
  await testRejectsTelegramMeFromApi();
  await testCallbackDoesNotActivatePremium();
  console.log('[telegram-stars-checkout.test] all checks passed');
}

main().catch((e) => {
  console.error('[telegram-stars-checkout.test] failed', e);
  process.exitCode = 1;
});
