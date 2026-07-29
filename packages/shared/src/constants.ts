export const ENERGY_DEFAULT = 100;
export const ENERGY_MAX_DISPLAY = 150;

/** Alpha timers (minutes) — home quick picks */
export const BAN_DURATIONS_MINUTES = [3, 10, 30, 60] as const;
export type BanDurationMinutes = (typeof BAN_DURATIONS_MINUTES)[number];

/** Instant-ban slider range (minutes) — any integer in [min, max] */
export const INSTANT_BAN_DURATION_MIN_MINUTES = 3;
export const INSTANT_BAN_DURATION_MAX_MINUTES = 60;

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

/**
 * Confirmed BotFather username — single canonical source for t.me invite/share links.
 * Do not use legacy aliases such as ninety8plus_bot.
 */
export const TELEGRAM_BOT_USERNAME = 'Ninety_eight_pluss_Bot';

/** Known incorrect usernames that must never appear in generated invite URLs. */
export const TELEGRAM_BOT_USERNAME_LEGACY_REJECTED = [
  'ninety8plus_bot',
  'ninety8plusbot',
] as const;


/** @deprecated use BAN_DURATIONS_MINUTES */
export const BAN_DURATIONS = BAN_DURATIONS_MINUTES;
export type BanDurationHours = BanDurationMinutes;

export const ANTI_FARM_DAILY_SUCCESS_LIMIT = 3;

/** Pair is energy-free when ban count today exceeds this (6th+ ban). */
export const PAIR_DAILY_FREE_MODE_BAN_LIMIT = 5;

export const SELF_BAN_DAILY_LIMIT = 10;
export const LOW_ENERGY_DAILY_BAN_LIMIT = 2;
export const LOW_ENERGY_THRESHOLD = 30;

export const COOLDOWN_SEND_SECONDS = 10;
export const COOLDOWN_OVERBOARD_SECONDS = 120;
export const COOLDOWN_CHECK_SECONDS = 5;

/** After check starts, auto-resolve if partner silent (minutes) */
export const CHECK_TIMEOUT_MINUTES = 120;

export const REMINDER_BEFORE_MS = 60_000;

/** Pending incoming older than this is auto-acked (pre-ack migration). */
export const INCOMING_PENDING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const SEED_BANS = [
  'Не есть сладкое',
  'Не сидеть в TikTok',
  'Не писать бывшему',
  'Не есть ночью',
  'Не играть',
  'Не пить алкоголь',
  'Не спать днём',
] as const;

/** Home screen preset chips (compact — max 4 to fit one screen) */
export const HOME_PRESET_BANS = [
  'писать бывшему',
  'играть',
  'есть ночью',
  'сидеть в TikTok',
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
  WHO_NATIVE_PICKER_STARTED: 'who_native_picker_started',
  WHO_NATIVE_PICKER_OPENED: 'who_native_picker_opened',
  WHO_NATIVE_PICKER_CANCELLED: 'who_native_picker_cancelled',
  WHO_NATIVE_PICKER_REGISTERED: 'who_native_picker_registered',
  WHO_NATIVE_PICKER_UNREGISTERED: 'who_native_picker_unregistered',
  WHO_NATIVE_PICKER_WHAT_OPENED: 'who_native_picker_what_opened',
  WHO_NATIVE_PICKER_FAILED: 'who_native_picker_failed',
  WS_RECONNECT: 'ws_reconnect',
  SESSION_RECOVERED: 'session_recovered',
  // —— Monetization (Profile / Premium / Payment Sheet) ——
  OPEN_PROFILE: 'open_profile',
  PRESS_LEARN: 'press_learn',
  OPEN_PREMIUM: 'open_premium',
  SELECT_PRODUCT: 'select_product',
  OPEN_PAYMENT_SHEET: 'open_payment_sheet',
  SELECT_PAYMENT_PROVIDER: 'select_payment_provider',
  CREATE_PAYMENT_INTENT: 'create_payment_intent',
  CLOSE_PAYMENT_SHEET: 'close_payment_sheet',
} as const;
