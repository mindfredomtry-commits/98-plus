import { Markup } from 'telegraf';
import {
  formatChallengeShareMessage,
  formatDurationLabel,
  formatIncomingBanMessage,
  formatSenderDisplayName,
  formatSenderEchoMessage,
  TELEGRAM_REPLY_BUTTON_LABEL,
} from '@98plus/shared';
import { getBot } from './index';
import { miniAppLink } from '../lib/deeplink';
import { prisma } from '../lib/prisma';
import { buildChallengeCardSvg } from './challenge-card';

function replyBanKeyboard(deepLink: string) {
  return Markup.inlineKeyboard([
    Markup.button.webApp(TELEGRAM_REPLY_BUTTON_LABEL, deepLink),
  ]);
}

async function deliverChallengeNotification(params: {
  telegramId: bigint;
  caption: string;
  deepLink: string;
  senderPhotoUrl?: string | null;
  cardParams?: {
    senderName: string;
    banText: string;
    durationMinutes: number;
  };
}): Promise<void> {
  const bot = getBot();
  if (!bot) return;

  const keyboard = replyBanKeyboard(params.deepLink);
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
        senderName: params.cardParams.senderName,
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

export async function sendIncomingBanNotification(
  telegramId: bigint,
  text: string,
  banId: string,
  isEcho = false,
  senderUsername?: string,
  durationMinutes?: number,
  senderFirstName?: string | null,
  senderPhotoUrl?: string | null,
  receiverLabel?: string | null,
) {
  const url = miniAppLink({ type: 'ban', banId });

  if (isEcho) {
    const bot = getBot();
    if (!bot) return;
    const message = formatSenderEchoMessage({
      banText: text,
      durationMinutes: durationMinutes ?? 10,
      receiverLabel,
    });
    try {
      await bot.telegram.sendMessage(telegramId.toString(), message);
    } catch {
      /* ignore */
    }
    return;
  }

  const senderName = formatSenderDisplayName(
    senderUsername,
    senderFirstName,
  );
  const caption = formatIncomingBanMessage({
    senderName,
    banText: text,
    durationMinutes: durationMinutes ?? 10,
  });

  await deliverChallengeNotification({
    telegramId,
    caption,
    deepLink: url,
    senderPhotoUrl,
    cardParams: {
      senderName,
      banText: text,
      durationMinutes: durationMinutes ?? 10,
    },
  });
}

export async function sendCheckNotification(
  telegramId: bigint,
  banText: string,
  banId: string,
) {
  const bot = getBot();
  if (!bot) return;

  const url = miniAppLink({ type: 'check', banId });
  const line = banText.trim().startsWith('🚫')
    ? banText.trim()
    : `🚫 ${banText.trim()}`;

  try {
    await bot.telegram.sendMessage(
      telegramId.toString(),
      `⏱ Пора честно ответить.\n\n${line}\n\nВыдержал?`,
      replyBanKeyboard(url),
    );
  } catch {
    /* ignore */
  }
}

export async function sendResultNotification(
  telegramId: bigint,
  banId: string,
  headline: string,
  banText: string,
) {
  const bot = getBot();
  if (!bot) return;

  const url = miniAppLink({ type: 'result', banId });
  const line = banText.trim().startsWith('🚫')
    ? banText.trim()
    : `🚫 ${banText.trim()}`;

  try {
    await bot.telegram.sendMessage(
      telegramId.toString(),
      `${headline}\n\n${line}`,
      Markup.inlineKeyboard([
        Markup.button.webApp('Посмотреть', url),
      ]),
    );
  } catch {
    /* ignore */
  }
}

export async function sendTimerReminderNotification(
  telegramId: bigint,
  banText: string,
  banId: string,
) {
  const bot = getBot();
  if (!bot) return;
  const url = miniAppLink({ type: 'ban', banId });
  const line = banText.trim().startsWith('🚫')
    ? banText.trim()
    : `🚫 ${banText.trim()}`;

  try {
    await bot.telegram.sendMessage(
      telegramId.toString(),
      `⏱ Скоро проверка.\n\n${line}\n\nДержишься?`,
      replyBanKeyboard(url),
    );
  } catch {
    /* ignore */
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

  const senderName = formatSenderDisplayName(
    params.senderUsername,
    params.senderFirstName,
  );
  const caption = formatIncomingBanMessage({
    senderName,
    banText: params.banText,
    durationMinutes: params.durationMinutes,
  });

  await deliverChallengeNotification({
    telegramId: registered.telegramId,
    caption,
    deepLink: params.deepLink,
    senderPhotoUrl: params.senderPhotoUrl,
    cardParams: {
      senderName,
      banText: params.banText,
      durationMinutes: params.durationMinutes,
    },
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
  await sendIncomingBanNotification(
    telegramId,
    banText,
    banId,
    false,
    senderUsername,
    durationMinutes,
    senderFirstName,
    senderPhotoUrl,
  );
}

/** Re-export for invite flow share picker (no URL in text). */
export { formatChallengeShareMessage };
