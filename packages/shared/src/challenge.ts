/** Telegram challenge copy — personal confrontation, not app broadcast. */

/** Incoming ban DM — counter-challenge via WebApp. */
export const REPLY_BAN_WEBAPP_BUTTON_LABEL = '🚫 запретить в ответ';

/** Check / status question DM — receiver answers about their own endurance. */
export const CHECK_BAN_RECEIVER_WEBAPP_BUTTON_LABEL = '🚫 Ты выдержал(а)?';

/** Check / status question DM — sender asks if counterparty held out. */
export const CHECK_BAN_SENDER_WEBAPP_BUTTON_LABEL = '🚫 Выдержал(а)?';

/** @deprecated Use role-specific CHECK_BAN_*_WEBAPP_BUTTON_LABEL */
export const CHECK_BAN_STATUS_WEBAPP_BUTTON_LABEL =
  CHECK_BAN_RECEIVER_WEBAPP_BUTTON_LABEL;

/** Retention DM — opens send flow to a friend. */
export const RETENTION_BAN_WEBAPP_BUTTON_LABEL = '🚫 запретить';

/** Result DM — opens repeat-ban flow for the same challenge. */
export const REPEAT_BAN_WEBAPP_BUTTON_LABEL = '🚫 запретить ещё';

/** Sender “Ты запретил” DM — next ban cycle (WebApp button label only). */
export const SENDER_BAN_CONFIRMED_WEBAPP_BUTTON_LABEL =
  '🚫 Запретить ещё раз!';

/** First-time /start after viral link — opens Mini App. */
export const OPEN_BAN_WEBAPP_BUTTON_LABEL = '🚫 Открыть запрет';

/** @deprecated Use REPLY_BAN_WEBAPP_BUTTON_LABEL */
export const TELEGRAM_REPLY_BUTTON_LABEL = REPLY_BAN_WEBAPP_BUTTON_LABEL;

/** @deprecated Use OPEN_BAN_WEBAPP_BUTTON_LABEL */
export const OPEN_MINI_APP_BUTTON_LABEL = OPEN_BAN_WEBAPP_BUTTON_LABEL;

export function formatDurationLabel(minutes: number): string {
  if (minutes >= 1440 && minutes % 1440 === 0) {
    const days = minutes / 1440;
    if (days === 1) return '1 день';
    if (days >= 2 && days <= 4) return `${days} дня`;
    return `${days} дней`;
  }
  if (minutes === 60) return '1 час';
  if (minutes > 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    if (hours === 1) return '1 час';
    if (hours >= 2 && hours <= 4) return `${hours} часа`;
    return `${hours} часов`;
  }
  const m = Math.max(1, Math.round(minutes));
  const mod10 = m % 10;
  const mod100 = m % 100;
  let word = 'минут';
  if (mod10 === 1 && mod100 !== 11) word = 'минута';
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    word = 'минуты';
  }
  return `${m} ${word}`;
}

/** firstName → displayName → @username; never empty. */
export function formatSenderDisplayName(
  username?: string | null,
  firstName?: string | null,
  displayName?: string | null,
): string {
  const name = firstName?.trim();
  if (name) return name;
  const alias = displayName?.trim();
  if (alias) return alias;
  const u = (username ?? '').replace(/^@/, '').trim();
  return u ? `@${u}` : 'Кто-то';
}

/** Result DM opponent name — firstName → displayName → username (no @); fallback «друг». */
export function formatParticipantDisplayName(
  username?: string | null,
  firstName?: string | null,
  displayName?: string | null,
): string {
  return formatTelegramDisplayName(username, firstName, displayName, 'друг');
}

export interface TelegramPersonFields {
  username?: string | null;
  firstName?: string | null;
  displayName?: string | null;
}

/** Display name for Telegram bot copy — firstName → displayName → username (no @). */
export function formatTelegramDisplayName(
  username?: string | null,
  firstName?: string | null,
  displayName?: string | null,
  fallback = 'друг',
): string {
  const name = firstName?.trim();
  if (name) return name;
  const alias = displayName?.trim();
  if (alias) return alias;
  const u = (username ?? '').replace(/^@/, '').trim();
  return u || fallback;
}

/** Clickable @username line — empty when username missing. */
export function formatTelegramUsernameLine(
  username?: string | null,
): string {
  const u = (username ?? '').replace(/^@/, '').trim();
  return u ? `@${u}` : '';
}

/** Name block with optional @username on the next line (no trailing blank lines). */
export function formatTelegramPersonBlock(
  person: TelegramPersonFields & { fallback?: string },
): string {
  const name = formatTelegramDisplayName(
    person.username,
    person.firstName,
    person.displayName,
    person.fallback ?? 'друг',
  );
  const userLine = formatTelegramUsernameLine(person.username);
  return userLine ? `${name}\n${userLine}` : name;
}

/** Incoming/check header — 🚫 on the name line, @username below when present. */
export function formatPersonalChallengePersonHeader(
  person: TelegramPersonFields,
): string {
  const name = formatTelegramDisplayName(
    person.username,
    person.firstName,
    person.displayName,
    'друг',
  );
  const userLine = formatTelegramUsernameLine(person.username);
  return userLine ? `🚫 ${name}\n${userLine}` : `🚫 ${name}`;
}

/** Telegram result outcomes that get a bot DM (not timeout/expired). */
export type TelegramResultOutcome =
  | 'both_yes'
  | 'both_no'
  | 'split'
  | 'overboard';

const TELEGRAM_RESULT_HEADLINES: Record<TelegramResultOutcome, string> = {
  both_yes: 'ЗАПРЕТИТЕЛЬНО! ✅✅',
  both_no: 'ЗАТО ЧЕСТНО! ❌❌',
  split: 'НЕСТЫКОВОЧКА! ❌✅',
  overboard: 'ПЕРЕБОР 🫷',
};

export function isTelegramResultOutcome(
  outcome: string,
): outcome is TelegramResultOutcome {
  return outcome in TELEGRAM_RESULT_HEADLINES;
}

export function formatTelegramResultHeadline(
  outcome: TelegramResultOutcome,
): string {
  return TELEGRAM_RESULT_HEADLINES[outcome];
}

/** Result DM — status, opponent, ban essence; no URL in body. */
export function formatBotResultMessage(params: {
  headline: string;
  opponentUsername?: string | null;
  opponentFirstName?: string | null;
  opponentDisplayName?: string | null;
  banText: string;
}): string {
  const person = formatTelegramPersonBlock({
    username: params.opponentUsername,
    firstName: params.opponentFirstName,
    displayName: params.opponentDisplayName,
    fallback: 'друг',
  });
  const essence = banTextEssence(params.banText);
  return `${params.headline}\n\n${person}\n\n🚫 ${essence}`;
}

/**
 * Strip leading "запрещаю" / "тебе" — ban essence for retention and shares.
 */
export function normalizeBanTextForShare(raw: string): string {
  let ban = raw.replace(/^🚫\s*/, '').trim();
  let prev: string;
  do {
    prev = ban;
    ban = ban.replace(/^запрещаю\s+(тебе\s+)?/iu, '').trim();
    ban = ban.replace(/^тебе\s+/iu, '').trim();
  } while (ban !== prev);
  return ban;
}

export function banTextEssence(raw: string): string {
  return normalizeBanTextForShare(raw) || '…';
}

/** Personal challenge block — reads like a message from the sender. */
export function formatPersonalChallengeBlock(params: {
  senderUsername?: string | null;
  senderFirstName?: string | null;
  senderDisplayName?: string | null;
  banText: string;
  durationMinutes: number;
}): string {
  const header = formatPersonalChallengePersonHeader({
    username: params.senderUsername,
    firstName: params.senderFirstName,
    displayName: params.senderDisplayName,
  });
  const essence = banTextEssence(params.banText);
  const dur = formatDurationLabel(params.durationMinutes);
  return `${header}\n\nЗапрещаю ${essence}\nна ${dur}.`;
}

/** Incoming ban DM — no link in body (link lives in WebApp button). */
export function formatIncomingBanMessage(params: {
  senderUsername?: string | null;
  senderFirstName?: string | null;
  senderDisplayName?: string | null;
  banText: string;
  durationMinutes: number;
}): string {
  return formatPersonalChallengeBlock(params);
}

/** @deprecated Use formatIncomingBanMessage */
export function formatBotStartChallengeMessage(params: {
  senderUsername?: string | null;
  senderFirstName?: string | null;
  senderDisplayName?: string | null;
  banText: string;
  durationMinutes: number;
}): string {
  return formatIncomingBanMessage(params);
}

/** Shared ban essence block — person header + «Запрещаю … на …». */
export function formatCheckChallengeBanBlock(params: {
  person: TelegramPersonFields;
  banText: string;
  durationMinutes: number;
}): string {
  const header = formatPersonalChallengePersonHeader(params.person);
  const essence = banTextEssence(params.banText);
  const dur = formatDurationLabel(params.durationMinutes);
  return `${header}\n\nЗапрещаю ${essence}\nна ${dur}.`;
}

export function checkBanWebAppButtonLabel(
  role: 'receiver' | 'sender',
): string {
  return role === 'receiver'
    ? CHECK_BAN_RECEIVER_WEBAPP_BUTTON_LABEL
    : CHECK_BAN_SENDER_WEBAPP_BUTTON_LABEL;
}

/** Check DM for ban receiver — ban was imposed on them. */
export function formatBotCheckChallengeMessageForReceiver(params: {
  senderUsername?: string | null;
  senderFirstName?: string | null;
  senderDisplayName?: string | null;
  banText: string;
  durationMinutes: number;
}): string {
  const block = formatCheckChallengeBanBlock({
    person: {
      username: params.senderUsername,
      firstName: params.senderFirstName,
      displayName: params.senderDisplayName,
    },
    banText: params.banText,
    durationMinutes: params.durationMinutes,
  });
  return `Был запрет тебе от\n\n${block}`;
}

/** Check DM for ban sender — their ban toward the counterparty. */
export function formatBotCheckChallengeMessageForSender(params: {
  receiverUsername?: string | null;
  receiverFirstName?: string | null;
  receiverDisplayName?: string | null;
  banText: string;
  durationMinutes: number;
}): string {
  const block = formatCheckChallengeBanBlock({
    person: {
      username: params.receiverUsername,
      firstName: params.receiverFirstName,
      displayName: params.receiverDisplayName,
    },
    banText: params.banText,
    durationMinutes: params.durationMinutes,
  });
  return `Был твой запрет для\n\n${block}`;
}

/** @deprecated Use role-specific formatBotCheckChallengeMessageFor* */
export function formatBotCheckChallengeMessage(params: {
  senderUsername?: string | null;
  senderFirstName?: string | null;
  senderDisplayName?: string | null;
  banText: string;
  durationMinutes: number;
}): string {
  return formatBotCheckChallengeMessageForReceiver(params);
}

/** Sender DM when receiver accepted the ban — shows receiver identity. */
export function formatBotBanAcceptedSenderMessage(params: {
  receiverUsername?: string | null;
  receiverFirstName?: string | null;
  receiverDisplayName?: string | null;
  banText: string;
  durationMinutes: number;
}): string {
  const person = formatTelegramPersonBlock({
    username: params.receiverUsername,
    firstName: params.receiverFirstName,
    displayName: params.receiverDisplayName,
    fallback: 'друг',
  });
  const essence = banTextEssence(params.banText);
  const dur = formatDurationLabel(params.durationMinutes);
  return `🚫 Ты запретил\n\n${person}\n\n${essence}\nна ${dur}.`;
}

/** Viral invite /start — no pair history yet. */
export function formatInviteToBanBotMessage(params: {
  inviterUsername?: string | null;
  inviterFirstName?: string | null;
  inviterDisplayName?: string | null;
}): string {
  const header = formatPersonalChallengePersonHeader({
    username: params.inviterUsername,
    firstName: params.inviterFirstName,
    displayName: params.inviterDisplayName,
  });
  return `${header}\n\nЗапрети мне то, что давно хотел!`;
}

/** Viral invite history — single-line question (no colon). */
export function formatInviteRetentionQuestion(essence: string): string {
  return `Сегодня снова можно ${essence}?`;
}

/** Viral invite /start — pair has ban history. */
export function formatInviteRetentionBotMessage(params: {
  inviterUsername?: string | null;
  inviterFirstName?: string | null;
  inviterDisplayName?: string | null;
  banText: string;
}): string {
  const header = formatPersonalChallengePersonHeader({
    username: params.inviterUsername,
    firstName: params.inviterFirstName,
    displayName: params.inviterDisplayName,
  });
  const essence = banTextEssence(params.banText);
  return `${header}\n\n${formatInviteRetentionQuestion(essence)}`;
}

/** Retention DM — re-engage with a prior ban to this friend. */
export function formatRetentionBanMessage(params: {
  friendUsername?: string | null;
  friendFirstName?: string | null;
  friendDisplayName?: string | null;
  banText: string;
}): string {
  const person = formatTelegramPersonBlock({
    username: params.friendUsername,
    firstName: params.friendFirstName,
    displayName: params.friendDisplayName,
    fallback: 'друг',
  });
  const essence = banTextEssence(params.banText);
  return `${person}\n\nсегодня можно ${essence}?`;
}

/** Native Telegram share text for pending challenges (includes link). */
export function formatChallengeShareMessage(params: {
  senderUsername: string;
  senderFirstName?: string | null;
  banText: string;
  durationMinutes: number;
  deepLink?: string;
}): string {
  void params.senderUsername;
  void params.senderFirstName;
  return formatViralBanShareMessage({
    banText: params.banText,
    durationMinutes: params.durationMinutes,
    link: params.deepLink ?? '',
  });
}

/** Viral Telegram share — direct challenge, single link at bottom. */
export function formatViralBanShareMessage(params: {
  banText: string;
  durationMinutes: number;
  link: string;
}): string {
  const essence = banTextEssence(params.banText);
  const dur = formatDurationLabel(params.durationMinutes);
  const body = `🚫 Запрещаю ${essence}\nна ${dur}.`;
  const link = params.link.trim();
  return link ? `${body}\n\n${link}` : body;
}
