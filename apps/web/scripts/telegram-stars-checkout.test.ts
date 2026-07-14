/**
 * Client Stars checkout URL test (no UI).
 *
 * Run: npx tsx apps/web/scripts/telegram-stars-checkout.test.ts
 *
 * Verifies the invoice URL returned by the API is forwarded to
 * Telegram.WebApp.openInvoice verbatim — never rewritten to telegram.me.
 * Also asserts diagnostic checkpoints A/B/C keep https://t.me/$slug.
 */
import assert from 'node:assert/strict';
import type { PaymentIntentResult } from '@98plus/shared';
import {
  isTelegramStarsInvoiceUrl,
  runTelegramStarsCheckout,
} from '../src/lib/telegram-stars-checkout';
import type { PaymentPollResult } from '../src/lib/poll-payment-status';

type OpenInvoiceCb = (status: string) => void;

type ConsoleCapture = {
  raw?: unknown;
  checkoutArg?: unknown;
  openInput?: unknown;
};

function installFakeTelegram(
  callbackStatus: string = 'cancelled',
): { getLastUrl: () => string | null; calls: () => number } {
  let lastUrl: string | null = null;
  let calls = 0;
  (globalThis as unknown as { window: unknown }).window = {
    Telegram: {
      WebApp: {
        version: '7.0',
        platform: 'tdesktop',
        openInvoice: (url: string, cb: OpenInvoiceCb) => {
          lastUrl = url;
          calls += 1;
          // Callback is UX-only — never activates Premium on its own.
          cb(callbackStatus);
        },
      },
    },
  };
  return { getLastUrl: () => lastUrl, calls: () => calls };
}

function captureStarsDiagLogs(run: () => Promise<unknown>): Promise<ConsoleCapture> {
  const captured: ConsoleCapture = {};
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    const tag = args[0];
    const payload = args[1];
    if (tag === '[STARS_INTENT_RESPONSE_RAW]') captured.raw = payload;
    if (tag === '[STARS_CHECKOUT_ARGUMENT]') captured.checkoutArg = payload;
    if (tag === '[STARS_OPEN_INVOICE_INPUT]') captured.openInput = payload;
    originalLog.apply(console, args);
  };
  return run().finally(() => {
    console.log = originalLog;
  }).then(() => captured);
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

function assertTMeInvoice(url: unknown, label: string): void {
  assert.equal(url, 'https://t.me/$test_slug', `${label} must stay t.me`);
  assert.ok(
    !String(url).includes('telegram.me'),
    `${label} must not become telegram.me`,
  );
}

async function testForwardsInvoiceUrlVerbatim(): Promise<void> {
  const tg = installFakeTelegram();
  const apiUrl = 'https://t.me/$test_slug';

  let outcome: Awaited<ReturnType<typeof runTelegramStarsCheckout>> | undefined;
  const captured = await captureStarsDiagLogs(async () => {
    outcome = await runTelegramStarsCheckout({
      createIntent: async () => makeIntent(apiUrl),
      pollStatus: pendingPoll,
    });
  });

  assert.equal(tg.calls(), 1, 'openInvoice must be called exactly once');
  assert.equal(
    tg.getLastUrl(),
    'https://t.me/$test_slug',
    'openInvoice must receive the exact API URL',
  );
  assert.ok(
    !String(tg.getLastUrl()).includes('telegram.me'),
    'invoice URL must not be rewritten to telegram.me',
  );
  assert.equal(outcome?.phase, 'cancelled');

  const raw = captured.raw as { invoiceUrl?: string } | undefined;
  const checkoutArg = captured.checkoutArg as { invoiceUrl?: string } | undefined;
  const openInput = captured.openInput as { invoiceUrl?: string } | undefined;

  assertTMeInvoice(raw?.invoiceUrl, 'A STARS_INTENT_RESPONSE_RAW');
  assertTMeInvoice(checkoutArg?.invoiceUrl, 'B STARS_CHECKOUT_ARGUMENT');
  assertTMeInvoice(openInput?.invoiceUrl, 'C STARS_OPEN_INVOICE_INPUT');
}

async function testRejectsTelegramMeHost(): Promise<void> {
  const tg = installFakeTelegram();
  const outcome = await runTelegramStarsCheckout({
    createIntent: async () => makeIntent('https://telegram.me/$test_slug'),
    pollStatus: pendingPoll,
  });

  assert.equal(tg.calls(), 0, 'openInvoice must not be called for invalid host');
  assert.equal(outcome.phase, 'failed');
}

async function testCallbackDoesNotActivatePremium(): Promise<void> {
  // Even if Telegram reports "paid", Premium must come from server poll only.
  const tg = installFakeTelegram('paid');
  const outcome = await runTelegramStarsCheckout({
    createIntent: async () => makeIntent('https://t.me/$test_slug'),
    pollStatus: pendingPoll,
  });

  assert.equal(tg.calls(), 1);
  assert.notEqual(
    outcome.phase,
    'success',
    'callback status alone must not activate Premium',
  );
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
  await testForwardsInvoiceUrlVerbatim();
  await testRejectsTelegramMeHost();
  await testCallbackDoesNotActivatePremium();
  console.log('[telegram-stars-checkout.test] all checks passed');
}

main().catch((e) => {
  console.error('[telegram-stars-checkout.test] failed', e);
  process.exitCode = 1;
});
