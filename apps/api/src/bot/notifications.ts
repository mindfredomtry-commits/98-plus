import { Markup } from 'telegraf';
import type { BanResult } from '@98plus/shared';
import {
  formatBotBanAcceptedSenderMessage,
  formatBotCheckChallengeMessage,
  formatBotResultMessage,
  formatChallengeShareMessage,
  formatDurationLabel,
  formatIncomingBanMessage,
  formatRetentionBanMessage,
  formatTelegramResultHeadline,
  isTelegramResultOutcome,
  OPEN_BAN_WEBAPP_BUTTON_LABEL,
  REPEAT_BAN_WEBAPP_BUTTON_LABEL,
  REPLY_BAN_WEBAPP_BUTTON_LABEL,
  RETENTION_BAN_WEBAPP_BUTTON_LABEL,
} from '@98plus/shared';
import { getBot } from './index';
import { miniAppLink } from '../lib/deeplink';
import { prisma } from '../lib/prisma';
import { buildChallengeCardSvg } from './challenge-card';
import { isDevTelegramId } from '../services/dev-fixtures.service';
import type { BanNotificationDebug } from '../lib/notification-debug';
import {
  formatTelegramApiError,
  getTelegramBotToken,
  telegramSendMessage,
} from '../lib/telegram-api';

function replyBanKeyboard(
  deepLink: string,
  buttonLabel = REPLY_BAN_WEBAPP_BUTTON_LABEL,
) {
  return Markup.inlineKeyboard([
    Markup.button.webApp(buttonLabel, deepLink),
  ]);
}

function keyboardToJson(
  deepLink: string,
  buttonLabel = REPLY_BAN_WEBAPP_BUTTON_LABEL,
) {
  return {
    inline_keyboard: [
      [
        {
          text: buttonLabel,
          web_app: { url: deepLink },
        },
      ],
    ],
  };
}

async function deliverChallengeNotification(params: {
  telegramId: bigint;
  caption: string;
  deepLink: string;
  buttonLabel?: string;
  senderPhotoUrl?: string | null;
  cardParams?: {
    senderUsername?: string | null;
    senderFirstName?: string | null;
    senderDisplayName?: string | null;
    banText: string;
    durationMinutes: number;
  };
}): Promise<void> {
  const bot = getBot();
  if (!bot) return;

  const keyboard = replyBanKeyboard(
    params.deepLink,
    params.buttonLabel ?? REPLY_BAN_WEBAPP_BUTTON_LABEL,
  );
  const chatId = params.telegramId.toString();

  if (params.senderPhotoUrl?.trim()) {
    try {
      await bot.telegram.sendPhoto(chatId, params.senderPhotoUrl.trim(), {
        caption: params.caption,
        ...keyboard,
      });
      return;
    } catch {
      /* try generated card or plain text */
    }
  }

  if (params.cardParams) {
    try {
      const svg = buildChallengeCardSvg({
        senderUsername: params.cardParams.senderUsername,
        senderFirstName: params.cardParams.senderFirstName,
        senderDisplayName: params.cardParams.senderDisplayName,
        banText: params.cardParams.banText,
        durationLabel: formatDurationLabel(params.cardParams.durationMinutes),
      });
      await bot.telegram.sendPhoto(chatId, { source: svg, filename: 'challenge.svg' }, {
        caption: params.caption,
        ...keyboard,
      });
      return;
    } catch {
      /* plain text */
    }
  }

  try {
    await bot.telegram.sendMessage(chatId, params.caption, keyboard);
  } catch {
    /* user may not have started bot */
  }
}

export interface RegisteredBanNotifyParams {
  banId: string;
  senderUserId: string;
  receiverUserId: string;
  receiverTelegramId: bigint;
  receiverUsername: string | null;
  senderUsername: string | null;
  senderFirstName: string | null;
  banText: string;
  durationMinutes: number;
  isDevMode: boolean;
}

function buildSkipReason(
  receiverTelegramId: bigint,
  senderUserId: string,
  receiverUserId: string,
): string | null {
  if (receiverUserId === senderUserId) {
    return 'receiver_equals_sender';
  }
  if (!receiverTelegramId || receiverTelegramId <= 0n) {
    return 'no_receiver_telegram_id';
  }
  if (isDevTelegramId(receiverTelegramId)) {
    return 'dev_fixture_telegram_id';
  }
  if (!getTelegramBotToken()) {
    return 'no_bot_token';
  }
  return null;
}

/** Direct ban to registered friend — viral text + optional Mini App button. */
export async function sendRegisteredFriendBanNotification(
  params: RegisteredBanNotifyParams,
): Promise<BanNotificationDebug> {
  const chatId = params.receiverTelegramId.toString();
  const baseDebug: BanNotificationDebug = {
    attempted: true,
    receiverTelegramId: chatId,
    receiverUserId: params.receiverUserId,
    receiverUsername: params.receiverUsername,
    senderUserId: params.senderUserId,
    skippedReason: null,
    telegramError: null,
    sent: false,
    isDevFixtureReceiver: isDevTelegramId(params.receiverTelegramId),
  };

  const skipReason = buildSkipReason(
    params.receiverTelegramId,
    params.senderUserId,
    params.receiverUserId,
  );

  console.log('[98+] telegram notify:start', {
    banId: params.banId,
    senderUserId: params.senderUserId,
    receiverUserId: params.receiverUserId,
    receiverTelegramId: chatId,
    receiverUsername: params.receiverUsername,
    isDevMode: params.isDevMode,
    isDevFixtureReceiver: baseDebug.isDevFixtureReceiver,
    skipReason,
    hasBotToken: !!getTelegramBotToken(),
    hasTelegraf: !!getBot(),
  });

  if (skipReason) {
    if (skipReason === 'dev_fixture_telegram_id') {
      console.log('[98+] dev notification skipped', {
        banId: params.banId,
        receiverTelegramId: chatId,
        reason: skipReason,
      });
    } else {
      console.log('[98+] telegram notify:skip', {
        banId: params.banId,
        reason: skipReason,
      });
    }
    return { ...baseDebug, skippedReason: skipReason };
  }

  const link = miniAppLink({ type: 'ban', banId: params.banId });
  const message = formatIncomingBanMessage({
    senderUsername: params.senderUsername,
    senderFirstName: params.senderFirstName,
    banText: params.banText,
    durationMinutes: params.durationMinutes,
  });

  const bot = getBot();

  if (bot) {
    try {
      const result = await bot.telegram.sendMessage(
        chatId,
        message,
        replyBanKeyboard(link, REPLY_BAN_WEBAPP_BUTTON_LABEL),
      );
      console.log('[98+] telegram notify:sent', {
        banId: params.banId,
        chatId,
        via: 'telegraf',
        messageId: result.message_id,
      });
      return { ...baseDebug, sent: true };
    } catch (e) {
      const err = formatTelegramApiError(e);
      console.warn('[98+] telegram notify:failed', {
        banId: params.banId,
        chatId,
        via: 'telegraf+keyboard',
        errorCode: err.code,
        error: err.message,
      });

      try {
        const plain = await bot.telegram.sendMessage(chatId, message);
        console.log('[98+] telegram notify:sent', {
          banId: params.banId,
          chatId,
          via: 'telegraf_plain',
          messageId: plain.message_id,
        });
        return { ...baseDebug, sent: true };
      } catch (e2) {
        const err2 = formatTelegramApiError(e2);
        console.warn('[98+] telegram notify:failed', {
          banId: params.banId,
          chatId,
          via: 'telegraf_plain',
          errorCode: err2.code,
          error: err2.message,
        });
      }
    }
  }

  let apiRes = await telegramSendMessage({
    chatId,
    text: message,
    replyMarkup: keyboardToJson(link, REPLY_BAN_WEBAPP_BUTTON_LABEL),
  });

  if (apiRes.ok) {
    console.log('[98+] telegram notify:sent', {
      banId: params.banId,
      chatId,
      via: 'http_api+keyboard',
      messageId: apiRes.result?.message_id,
    });
    return { ...baseDebug, sent: true };
  }

  console.warn('[98+] telegram notify:failed', {
    banId: params.banId,
    chatId,
    via: 'http_api+keyboard',
    errorCode: apiRes.error_code,
    error: apiRes.description,
  });

  apiRes = await telegramSendMessage({ chatId, text: message });
  if (apiRes.ok) {
    console.log('[98+] telegram notify:sent', {
      banId: params.banId,
      chatId,
      via: 'http_api_plain',
      messageId: apiRes.result?.message_id,
    });
    return { ...baseDebug, sent: true };
  }

  const errMsg = apiRes.description ?? 'unknown';
  console.warn('[98+] telegram notify:failed', {
    banId: params.banId,
    chatId,
    via: 'http_api_plain',
    errorCode: apiRes.error_code,
    error: errMsg,
  });

  return {
    ...baseDebug,
    telegramError: errMsg,
    telegramErrorCode: apiRes.error_code,
  };
}

/** Non-blocking — never fails ban creation. */
export function notifyRegisteredFriendBanAsync(
  params: RegisteredBanNotifyParams,
): void {
  void sendRegisteredFriendBanNotification(params).catch((e) => {
    const err = formatTelegramApiError(e);
    console.warn('[98+] telegram notify:failed', {
      banId: params.banId,
      unhandled: true,
      errorCode: err.code,
      error: err.message,
    });
  });
}

export async function sendIncomingBanNotification(
  telegramId: bigint,
  text: string,
  banId: string,
  senderUsername?: string,
  durationMinutes?: number,
  senderFirstName?: string | null,
  senderPhotoUrl?: string | null,
) {
  const url = miniAppLink({ type: 'ban', banId });

  const caption = formatIncomingBanMessage({
    senderUsername,
    senderFirstName,
    banText: text,
    durationMinutes: durationMinutes ?? 10,
  });

  await deliverChallengeNotification({
    telegramId,
    caption,
    deepLink: url,
    buttonLabel: REPLY_BAN_WEBAPP_BUTTON_LABEL,
    senderPhotoUrl,
    cardParams: {
      senderUsername,
      senderFirstName,
      banText: text,
      durationMinutes: durationMinutes ?? 10,
    },
  });
}

export interface BotStartInviteChallengeParams {
  telegramId: bigint;
  senderUsername?: string | null;
  senderFirstName?: string | null;
  senderPhotoUrl?: string | null;
  banText: string;
  durationMinutes: number;
  deepLink: string;
  inviteToken?: string;
  claimed?: boolean;
}

/** Viral /start — branded challenge + optional SVG card + WebApp open button. */
export async function sendBotStartInviteChallenge(
  params: BotStartInviteChallengeParams,
): Promise<'sent' | 'skipped' | 'failed'> {
  const chatId = params.telegramId.toString();

  if (isDevTelegramId(params.telegramId)) {
    console.log('[98+] dev notification skipped', {
      chatId,
      reason: 'dev_fixture_telegram_id',
      inviteToken: params.inviteToken,
    });
    return 'skipped';
  }

  const bot = getBot();
  if (!bot) {
    console.warn('[98+] bot start failed', {
      chatId,
      reason: 'no_bot',
      inviteToken: params.inviteToken,
    });
    return 'failed';
  }

  const caption = formatIncomingBanMessage({
    senderUsername: params.senderUsername,
    senderFirstName: params.senderFirstName,
    banText: params.banText,
    durationMinutes: params.durationMinutes,
  });

  try {
    await deliverChallengeNotification({
      telegramId: params.telegramId,
      caption,
      deepLink: params.deepLink,
      buttonLabel: REPLY_BAN_WEBAPP_BUTTON_LABEL,
      senderPhotoUrl: params.senderPhotoUrl,
      cardParams: {
        senderUsername: params.senderUsername,
        senderFirstName: params.senderFirstName,
        banText: params.banText,
        durationMinutes: params.durationMinutes,
      },
    });
    console.log('[98+] bot start webapp button sent', {
      chatId,
      inviteToken: params.inviteToken,
      claimed: params.claimed ?? false,
      deepLink: params.deepLink,
    });
    return 'sent';
  } catch (e) {
    const err = formatTelegramApiError(e);
    console.error('[98+] bot start failed', {
      chatId,
      inviteToken: params.inviteToken,
      errorCode: err.code,
      error: err.message,
    });
    return 'failed';
  }
}

export async function sendCheckNotification(
  telegramId: bigint,
  banText: string,
  banId: string,
  senderUsername?: string | null,
  senderFirstName?: string | null,
  durationMinutes?: number,
) {
  const bot = getBot();
  if (!bot) return;

  const url = miniAppLink({ type: 'check', banId });
  const message = formatBotCheckChallengeMessage({
    senderUsername,
    senderFirstName,
    banText,
    durationMinutes: durationMinutes ?? 10,
  });

  try {
    await bot.telegram.sendMessage(
      telegramId.toString(),
      message,
      replyBanKeyboard(url, REPLY_BAN_WEBAPP_BUTTON_LABEL),
    );
  } catch {
    /* ignore */
  }
}

/** Sender DM when receiver accepted ban — once per banId. */
export async function sendBanAcceptedSenderNotification(params: {
  telegramId: bigint;
  banId: string;
  receiverUsername?: string | null;
  receiverFirstName?: string | null;
  receiverDisplayName?: string | null;
  banText: string;
  durationMinutes: number;
}): Promise<void> {
  if (isDevTelegramId(params.telegramId)) return;
  const bot = getBot();
  if (!bot) return;

  const message = formatBotBanAcceptedSenderMessage({
    receiverUsername: params.receiverUsername,
    receiverFirstName: params.receiverFirstName,
    receiverDisplayName: params.receiverDisplayName,
    banText: params.banText,
    durationMinutes: params.durationMinutes,
  });
  const link = miniAppLink({ type: 'repeat', banId: params.banId });

  try {
    await bot.telegram.sendMessage(
      params.telegramId.toString(),
      message,
      replyBanKeyboard(link, REPLY_BAN_WEBAPP_BUTTON_LABEL),
    );
  } catch {
    /* user may not have started bot */
  }
}

/** Result DM — skip timeout/expired; repeat-ban button only (no URL in text). */
export async function sendResultNotification(
  telegramId: bigint,
  result: BanResult,
): Promise<void> {
  if (result.outcome === 'timeout' || result.outcome === 'expired') return;
  if (!isTelegramResultOutcome(result.outcome)) return;
  if (isDevTelegramId(telegramId)) return;

  const bot = getBot();
  if (!bot) return;

  const headline = formatTelegramResultHeadline(result.outcome);
  const message = formatBotResultMessage({
    headline,
    opponentUsername: result.opponent.username,
    opponentFirstName: result.opponent.firstName,
    banText: result.text,
  });
  const link = miniAppLink({ type: 'repeat', banId: result.id });

  try {
    await bot.telegram.sendMessage(
      telegramId.toString(),
      message,
      replyBanKeyboard(link, REPEAT_BAN_WEBAPP_BUTTON_LABEL),
    );
  } catch {
    /* user may not have started bot */
  }
}

export async function sendRetentionNotification(params: {
  telegramId: bigint;
  friendUsername: string;
  friendFirstName?: string | null;
  friendDisplayName?: string | null;
  banText: string;
}): Promise<void> {
  if (isDevTelegramId(params.telegramId)) return;
  const bot = getBot();
  if (!bot) return;

  const link = miniAppLink({
    type: 'invite',
    username: params.friendUsername.replace('@', ''),
  });
  const message = formatRetentionBanMessage({
    friendUsername: params.friendUsername,
    friendFirstName: params.friendFirstName,
    friendDisplayName: params.friendDisplayName,
    banText: params.banText,
  });

  try {
    await bot.telegram.sendMessage(
      params.telegramId.toString(),
      message,
      replyBanKeyboard(link, RETENTION_BAN_WEBAPP_BUTTON_LABEL),
    );
  } catch {
    /* user may not have started bot */
  }
}

/** Bot DM when recipient already registered (share is primary for new users) */
export async function sendPendingBanInviteToUser(params: {
  targetUsername: string;
  senderUsername: string;
  senderFirstName?: string | null;
  senderPhotoUrl?: string | null;
  banText: string;
  durationMinutes: number;
  deepLink: string;
}) {
  const registered = await prisma.user.findFirst({
    where: {
      username: { equals: params.targetUsername, mode: 'insensitive' },
    },
  });

  if (!registered) return;

  await sendBotStartInviteChallenge({
    telegramId: registered.telegramId,
    senderUsername: params.senderUsername,
    senderFirstName: params.senderFirstName,
    senderPhotoUrl: params.senderPhotoUrl,
    banText: params.banText,
    durationMinutes: params.durationMinutes,
    deepLink: params.deepLink,
  });
}

export async function sendInviteClaimWelcome(
  telegramId: bigint,
  senderUsername: string,
  banText: string,
  banId: string,
  durationMinutes: number,
  senderFirstName?: string | null,
  senderPhotoUrl?: string | null,
) {
  const deepLink = miniAppLink({ type: 'ban', banId });
  await sendBotStartInviteChallenge({
    telegramId,
    senderUsername,
    senderFirstName,
    senderPhotoUrl,
    banText,
    durationMinutes,
    deepLink,
    claimed: true,
  });
}

/** Re-export for invite flow share picker (no URL in text). */
export { formatChallengeShareMessage };
