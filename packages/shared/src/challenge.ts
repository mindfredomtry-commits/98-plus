/** Telegram challenge copy — personal confrontation, not app broadcast. */

export const TELEGRAM_REPLY_BUTTON_LABEL = '🚫 запретить в ответ!';

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

export function formatSenderDisplayName(
  username?: string | null,
  firstName?: string | null,
): string {
  const name = firstName?.trim();
  if (name) return name;
  const u = (username ?? '').replace(/^@/, '').trim();
  return u ? `@${u}` : 'Кто-то';
}

function formatBanLine(banText: string): string {
  const t = banText.trim();
  if (!t) return '🚫 …';
  return t.startsWith('🚫') ? t : `🚫 ${t}`;
}

/**
 * Strip leading "запрещаю" / "тебе" so share reads: «Запрещаю {content} на …» once.
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

/** Bot DM / notification body — no URLs, no app headers. */
export function formatIncomingBanMessage(params: {
  senderName: string;
  banText: string;
  durationMinutes: number;
}): string {
  return (
    `${params.senderName} запретил тебе:\n\n` +
    `${formatBanLine(params.banText)}\n` +
    `⏱ ${formatDurationLabel(params.durationMinutes)}\n\n` +
    `Сможешь выдержать?`
  );
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
  const ban = normalizeBanTextForShare(params.banText) || '…';
  const dur = formatDurationLabel(params.durationMinutes);
  return (
    `🚫 Запрещаю ${ban} на ${dur}.\n\n` +
    `Запретить в ответ?\n` +
    params.link.trim()
  );
}

/** Confirmation DM to sender after they sent a ban. */
export function formatSenderEchoMessage(params: {
  banText: string;
  durationMinutes: number;
  receiverLabel?: string | null;
}): string {
  const who = params.receiverLabel?.trim();
  const lead = who
    ? `Ты запретил ${who}:`
    : 'Ты отправил запрет:';
  return (
    `${lead}\n\n` +
    `${formatBanLine(params.banText)}\n` +
    `⏱ ${formatDurationLabel(params.durationMinutes)}\n\n` +
    `Ждём ответа.`
  );
}
