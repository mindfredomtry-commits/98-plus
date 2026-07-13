import type { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { isTelegramStarsEnabled } from '../config/telegram-stars';
import {
  buildPaySupportMessage,
  handleStarsPreCheckoutQuery,
  handleStarsSuccessfulPayment,
} from '../services/telegram-stars-payment.service';

/** Wire Telegram Stars payment updates into the existing bot pipeline. */
export function registerTelegramStarsHandlers(bot: Telegraf): void {
  bot.command('paysupport', async (ctx) => {
    await ctx.reply(buildPaySupportMessage());
  });

  if (!isTelegramStarsEnabled()) {
    return;
  }

  bot.on('pre_checkout_query', async (ctx) => {
    const query = ctx.preCheckoutQuery;
    if (!query?.from) return;

    try {
      await handleStarsPreCheckoutQuery({
        id: query.id,
        fromId: query.from.id,
        currency: query.currency,
        totalAmount: query.total_amount,
        invoicePayload: query.invoice_payload,
        updateId: ctx.update.update_id,
      });
    } catch (e) {
      console.error('[telegram-stars] pre_checkout_query failed', {
        updateId: ctx.update.update_id,
        error: e instanceof Error ? e.message : 'unknown',
      });
    }
  });

  bot.on(message('successful_payment'), async (ctx) => {
    const payment = ctx.message.successful_payment;
    if (!ctx.from) return;

    try {
      await handleStarsSuccessfulPayment({
        fromId: ctx.from.id,
        currency: payment.currency,
        totalAmount: payment.total_amount,
        invoicePayload: payment.invoice_payload,
        telegramPaymentChargeId: payment.telegram_payment_charge_id,
        providerPaymentChargeId: payment.provider_payment_charge_id,
        updateId: ctx.update.update_id,
      });
    } catch (e) {
      console.error('[telegram-stars] successful_payment failed', {
        updateId: ctx.update.update_id,
        error: e instanceof Error ? e.message : 'unknown',
      });
    }
  });
}
