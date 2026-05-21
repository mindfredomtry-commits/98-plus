import { Telegraf } from 'telegraf';
import { Markup } from 'telegraf';
import { prisma } from '../lib/prisma';
import {
  claimInviteByToken,
  claimInvitesForUser,
  getInvitePreview,
} from '../services/invite.service';
import { miniAppLink } from '../lib/deeplink';
import {
  formatIncomingBanMessage,
  formatSenderDisplayName,
  TELEGRAM_REPLY_BUTTON_LABEL,
} from '@98plus/shared';
import { sendInviteClaimWelcome } from './notifications';

let bot: Telegraf | null = null;

export function getBot(): Telegraf | null {
  return bot;
}

function webAppUrl() {
  return (
    process.env.WEBAPP_URL ?? process.env.CORS_ORIGIN ?? 'http://localhost:3000'
  );
}

export function startBot(): Telegraf | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn('[bot] TELEGRAM_BOT_TOKEN not set — notifications disabled');
    return null;
  }

  bot = new Telegraf(token);

  bot.start(async (ctx) => {
    const tgUser = ctx.from;
    if (!tgUser) return;

    const payload = (ctx.startPayload ?? '').trim();

    const user = await prisma.user.upsert({
      where: { telegramId: BigInt(tgUser.id) },
      create: {
        telegramId: BigInt(tgUser.id),
        username: tgUser.username ?? null,
        firstName: tgUser.first_name,
        lastName: tgUser.last_name ?? null,
        photoUrl: null,
      },
      update: {
        username: tgUser.username ?? null,
        firstName: tgUser.first_name,
        lastName: tgUser.last_name ?? null,
        lastSeenAt: new Date(),
      },
    });

    if (payload.startsWith('invite_')) {
      const inviteToken = payload.slice(7);
      const claimed = await claimInviteByToken(
        inviteToken,
        user.id,
        user.username,
      );

      if (claimed) {
        const sender = claimed.sender;
        await sendInviteClaimWelcome(
          BigInt(tgUser.id),
          sender.username ?? sender.firstName,
          claimed.text,
          claimed.id,
          claimed.durationMinutes,
          sender.firstName,
          sender.photoUrl,
        );
        const banUrl = miniAppLink({ type: 'ban', banId: claimed.id });
        await ctx.reply(
          formatIncomingBanMessage({
            senderName: formatSenderDisplayName(
              sender.username,
              sender.firstName,
            ),
            banText: claimed.text,
            durationMinutes: claimed.durationMinutes,
          }),
          Markup.inlineKeyboard([
            Markup.button.webApp(TELEGRAM_REPLY_BUTTON_LABEL, banUrl),
          ]),
        );
        return;
      }

      const preview = await getInvitePreview(inviteToken);
      if (preview) {
        const previewUrl = miniAppLink({
          type: 'invite_token',
          token: inviteToken,
        });
        await ctx.reply(
          formatIncomingBanMessage({
            senderName: formatSenderDisplayName(
              preview.sender.username,
              preview.sender.firstName,
            ),
            banText: preview.text,
            durationMinutes: preview.durationMinutes,
          }),
          Markup.inlineKeyboard([
            Markup.button.webApp(TELEGRAM_REPLY_BUTTON_LABEL, previewUrl),
          ]),
        );
        return;
      }
    }

    await claimInvitesForUser(user.id, user.username);

    await ctx.reply(
      'Здесь люди запрещают друг другу слабости.\n\nКто-то ждёт твой ответ?',
      Markup.inlineKeyboard([
        Markup.button.webApp(TELEGRAM_REPLY_BUTTON_LABEL, webAppUrl()),
      ]),
    );
  });

  bot.launch().then(() => console.log('[bot] started'));
  return bot;
}
