import { Telegraf, type Context } from 'telegraf';
import { Markup } from 'telegraf';
import { prisma } from '../lib/prisma';
import {
  claimInviteByToken,
  claimInvitesForUser,
  getInvitePreview,
} from '../services/invite.service';
import { botWebAppButtonUrl, botWebAppPlainOpenUrl } from '../lib/deeplink';
import { OPEN_BAN_WEBAPP_BUTTON_LABEL, WELCOME_WEBAPP_BUTTON_LABEL } from '@98plus/shared';
import { sendBotStartInviteChallenge, sendViralInviteBootNotification } from './notifications';
import { findUserByUsername } from '../services/ban.service';
import { resolveViralInviteBootContext } from '../services/invite-deeplink.service';
import { registerTelegramStarsHandlers } from './telegram-stars-handlers';

let bot: Telegraf | null = null;
let botLaunchStarted = false;

const BOT_ALLOWED_UPDATES = [
  'message',
  'callback_query',
  'pre_checkout_query',
  'inline_query',
] as const;

export function getBot(): Telegraf | null {
  return bot;
}

function webAppUrl() {
  return (
    process.env.WEBAPP_URL ?? process.env.CORS_ORIGIN ?? 'http://localhost:3000'
  );
}

/** Last message on /start — refreshes chat-list preview web_app button URL. */
async function sendStartWelcomePreviewMessage(
  ctx: Context,
  meta: { payload?: string | null },
): Promise<void> {
  const defaultAppUrl = botWebAppPlainOpenUrl({
    source: 'botStartWelcomePreview',
    buttonLabel: WELCOME_WEBAPP_BUTTON_LABEL,
  });
  await ctx.reply(
    '🚫 98+\n\nКто-то мог отправить тебе запрет.\nОткрой, чтобы увидеть вызовы и ответить.',
    Markup.inlineKeyboard([
      Markup.button.webApp(WELCOME_WEBAPP_BUTTON_LABEL, defaultAppUrl),
    ]),
  );
  console.log('[98+] bot start welcome preview sent', {
    telegramId: ctx.from?.id ?? null,
    payload: meta.payload ?? null,
    webAppUrl: defaultAppUrl,
    buttonLabel: WELCOME_WEBAPP_BUTTON_LABEL,
  });
}

export function startBot(): Telegraf | null {
  if (botLaunchStarted) {
    console.warn('[bot] startBot skipped — polling already started in this process', {
      processId: process.pid,
    });
    return bot;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn('[bot] TELEGRAM_BOT_TOKEN not set — notifications disabled');
    return null;
  }

  botLaunchStarted = true;
  bot = new Telegraf(token);

  bot.start(async (ctx) => {
    const tgUser = ctx.from;
    if (!tgUser) return;

    const payload = (ctx.startPayload ?? '').trim();
    const chatId = BigInt(tgUser.id);

    console.log('[98+] bot start payload received', {
      telegramId: tgUser.id,
      payload: payload || null,
      username: tgUser.username ?? null,
    });

    try {
      const user = await prisma.user.upsert({
        where: { telegramId: chatId },
        create: {
          telegramId: chatId,
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

      if (payload.startsWith('u_')) {
        const inviterUsername = payload.slice(2).replace('@', '').trim();
        const inviter = inviterUsername
          ? await findUserByUsername(inviterUsername)
          : null;

        if (inviter && inviter.id !== user.id) {
          const bootContext = await resolveViralInviteBootContext(
            user.id,
            inviter.id,
          );
          const delivery = await sendViralInviteBootNotification({
            telegramId: chatId,
            inviterId: inviter.id,
            inviterUsername: inviter.username,
            inviterFirstName: inviter.firstName,
            mode: bootContext.mode,
            banText:
              bootContext.mode === 'history' ? bootContext.banText : undefined,
            historyBanId:
              bootContext.mode === 'history' ? bootContext.banId : undefined,
          });
          console.log('[98+] bot start viral invite processed', {
            telegramId: tgUser.id,
            inviterId: inviter.id,
            inviterUsername,
            mode: bootContext.mode,
            historyBanId:
              bootContext.mode === 'history' ? bootContext.banId : null,
            delivery,
          });
          return;
        }

        console.warn('[98+] bot start viral invite fallback', {
          telegramId: tgUser.id,
          inviterUsername: inviterUsername || null,
          reason: !inviter
            ? 'inviter_not_found'
            : inviter.id === user.id
              ? 'self_invite'
              : 'unknown',
        });
      }

      if (payload.startsWith('invite_')) {
        const inviteToken = payload.slice(7);
        const claimed = await claimInviteByToken(
          inviteToken,
          user.id,
          user.username,
        );

        if (claimed) {
          const sender = claimed.sender;
          const banUrl = botWebAppButtonUrl({ type: 'ban', banId: claimed.id });
          const result = await sendBotStartInviteChallenge({
            telegramId: chatId,
            senderUsername: sender.username,
            senderFirstName: sender.firstName,
            senderPhotoUrl: sender.photoUrl,
            banText: claimed.text,
            durationMinutes: claimed.durationMinutes,
            deepLink: banUrl,
            inviteToken,
            claimed: true,
          });
          console.log('[98+] bot start invite processed', {
            telegramId: tgUser.id,
            inviteToken,
            claimed: true,
            banId: claimed.id,
            delivery: result,
          });
          return;
        }

        const preview = await getInvitePreview(inviteToken);
        if (preview) {
          const previewUrl = botWebAppButtonUrl(
            { type: 'invite_token', token: inviteToken },
            {
              source: 'botStartInvitePreview',
              buttonLabel: OPEN_BAN_WEBAPP_BUTTON_LABEL,
            },
          );
          const result = await sendBotStartInviteChallenge({
            telegramId: chatId,
            senderUsername: preview.sender.username,
            senderFirstName: preview.sender.firstName,
            senderPhotoUrl: preview.sender.photoUrl,
            banText: preview.text,
            durationMinutes: preview.durationMinutes,
            deepLink: previewUrl,
            inviteToken,
            claimed: false,
          });
          console.log('[98+] bot start invite processed', {
            telegramId: tgUser.id,
            inviteToken,
            claimed: false,
            delivery: result,
          });
          return;
        }

        console.warn('[98+] bot start failed', {
          telegramId: tgUser.id,
          inviteToken,
          reason: 'invite_not_found',
        });
      }

      await claimInvitesForUser(user.id, user.username);

      if (!payload) {
        await sendStartWelcomePreviewMessage(ctx, { payload: null });
      }
    } catch (e) {
      console.error('[98+] bot start failed', {
        telegramId: tgUser.id,
        payload: payload || null,
        error: (e as Error).message,
      });
    }
  });

  registerTelegramStarsHandlers(bot);

  // Telegraf `launch()` Promise resolves when polling stops — log start before await.
  console.log('BOT_POLLING_STARTED', {
    processId: process.pid,
    instanceId:
      process.env.RAILWAY_REPLICA_ID ??
      process.env.RAILWAY_DEPLOYMENT_ID ??
      null,
    allowedUpdates: [...BOT_ALLOWED_UPDATES],
    timestamp: new Date().toISOString(),
  });
  console.log('[bot] started', {
    hasToken: true,
    webAppUrl: webAppUrl(),
  });

  bot
    .launch({
      allowedUpdates: [...BOT_ALLOWED_UPDATES],
    })
    .then(() => {
      console.log('[bot] polling stopped', { processId: process.pid });
    })
    .catch((err) => {
      console.error('[bot] launch failed', (err as Error).message);
    });
  return bot;
}
