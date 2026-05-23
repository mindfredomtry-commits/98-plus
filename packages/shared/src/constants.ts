export const ENERGY_DEFAULT = 100;
export const ENERGY_MAX_DISPLAY = 150;

/** Alpha timers (minutes) — home quick picks */
export const BAN_DURATIONS_MINUTES = [3, 10, 30, 60] as const;
export type BanDurationMinutes = (typeof BAN_DURATIONS_MINUTES)[number];

/** First-ban onboarding duration choices */
export const ONBOARDING_DURATION_OPTIONS = [
  { label: '1 час', minutes: 60 },
  { label: '3 часа', minutes: 180 },
  { label: '24 часа', minutes: 1440 },
  { label: '3 дня', minutes: 4320 },
  { label: '7 дней', minutes: 10080 },
] as const;

export const ONBOARDING_SUGGESTION_CHIPS = [
  'алкоголь',
  'энергетики',
  'сладкое',
  'ночные перекусы',
  'курение',
] as const;

/** Placeholder username for Telegram share picker (token claim is authoritative) */
export const SHARE_PICKER_USERNAME = 'share';

/** @deprecated use BAN_DURATIONS_MINUTES */
export const BAN_DURATIONS = BAN_DURATIONS_MINUTES;
export type BanDurationHours = BanDurationMinutes;

export const ANTI_FARM_DAILY_SUCCESS_LIMIT = 3;

export const SELF_BAN_DAILY_LIMIT = 10;
export const LOW_ENERGY_DAILY_BAN_LIMIT = 2;
export const LOW_ENERGY_THRESHOLD = 30;

export const COOLDOWN_SEND_SECONDS = 10;
export const COOLDOWN_OVERBOARD_SECONDS = 120;
export const COOLDOWN_CHECK_SECONDS = 5;

/** After check starts, auto-resolve if partner silent (minutes) */
export const CHECK_TIMEOUT_MINUTES = 120;

export const REMINDER_BEFORE_MS = 60_000;

export const SEED_BANS = [
  'Не есть сладкое',
  'Не сидеть в TikTok',
  'Не писать бывшему',
  'Не есть ночью',
  'Не играть',
  'Не пить алкоголь',
  'Не спать днём',
] as const;

/** Home screen preset chips (compact viral labels) */
export const HOME_PRESET_BANS = [
  'писать бывшему',
  'играть',
  'есть ночью',
  'сидеть в TikTok',
  'есть сладкое',
  'пить алкоголь',
] as const;

export const EXAMPLE_BANS = [
  ...SEED_BANS,
  'Запрещаю тебе писать «пон»',
] as const;

export const SYSTEM_VOICE = {
  banAccepted: '🚫 Запрет принят.',
  banSent: '✔ Запрет отправлен',
  banPending: '✔ Запрет отправлен',
  checkComplete: '⚡ Проверка завершена.',
  checkPrompt: 'Ты выдержал?',
  socialUnstable: '⚠️ Social reality unstable.',
  interactionCollapsed: '⚡ Interaction collapsed.',
  energyReduced: '⚡ Энергия снижена.',
  overboard: '⚠️ ПЕРЕБОР',
  timerReminder: '⏱ Скоро проверка.',
  offline: 'Нет связи. Повторяем…',
} as const;

export const ANALYTICS_EVENTS = {
  BAN_SENT: 'ban_sent',
  BAN_REJECTED: 'ban_rejected',
  BAN_ACCEPTED: 'ban_accepted',
  BAN_COUNTER: 'ban_counter',
  BAN_OVERBOARD: 'ban_overboard',
  CHECK_ANSWERED: 'check_answered',
  CHECK_IGNORED: 'check_ignored',
  CHECK_TIMEOUT: 'check_timeout',
  RESULT_VIEWED: 'result_viewed',
  RESULT_SHARED: 'result_shared',
  INVITE_SHARED: 'invite_shared',
  INVITE_PENDING_CREATED: 'invite_pending_created',
  INVITE_CLAIMED: 'invite_claimed',
  WS_RECONNECT: 'ws_reconnect',
  SESSION_RECOVERED: 'session_recovered',
} as const;
