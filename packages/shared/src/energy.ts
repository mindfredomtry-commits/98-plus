import {
  ENERGY_MAX_DISPLAY,
  LOW_ENERGY_THRESHOLD,
  PAIR_DAILY_FREE_MODE_BAN_LIMIT,
} from './constants';

/** Lobby ring / CTA / confirm-hold send gate — influence below this blocks ban creation. */
export const LOBBY_MIN_INFLUENCE_PERCENT = 10;

export type AuraLevel =
  | 'weak'
  | 'stable'
  | 'strong'
  | 'dangerous'
  | 'ninety8plus';

export const AURA_LABELS: Record<AuraLevel, string> = {
  weak: 'Слабая энергия',
  stable: 'Стабильная',
  strong: 'Сильная',
  dangerous: 'Опасная',
  ninety8plus: '98+',
};

export function getAuraLevel(energy: number): AuraLevel {
  if (energy >= 120) return 'ninety8plus';
  if (energy >= 90) return 'dangerous';
  if (energy >= 70) return 'strong';
  if (energy >= 45) return 'stable';
  return 'weak';
}

export function getRewardMultiplier(energy: number): number {
  if (energy >= 100) return 1;
  if (energy >= 60) return 0.75;
  if (energy >= 30) return 0.5;
  return 0.25;
}

export function isLowEnergy(energy: number): boolean {
  return energy < LOW_ENERGY_THRESHOLD;
}

export function influencePercentFromEnergy(energy: number): number {
  if (!Number.isFinite(energy)) return 0;
  return Math.min(
    100,
    Math.max(0, Math.round((energy / ENERGY_MAX_DISPLAY) * 100)),
  );
}

/** Shared gate for lobby CTA, confirm hold, and backend canSendBan. */
export function hasEnoughEnergyToSendBan(energy: number): boolean {
  return (
    influencePercentFromEnergy(energy) >= LOBBY_MIN_INFLUENCE_PERCENT
  );
}

export function hasEnoughInfluenceToSendBan(influencePercent: number): boolean {
  if (!Number.isFinite(influencePercent)) return false;
  return (
    Math.min(100, Math.max(0, influencePercent)) >=
    LOBBY_MIN_INFLUENCE_PERCENT
  );
}

export const INSUFFICIENT_ENERGY_ERROR = 'INSUFFICIENT_ENERGY' as const;

/** Low-energy band daily ban cap — legacy human message (do not use for new API errors). */
export const LOW_ENERGY_DAILY_LIMIT_ERROR =
  '⚡ Энергия снижена. Лимит на сегодня.' as const;

/** Daily ban quota exhausted for low-energy band — distinct from insufficient energy. */
export const DAILY_BAN_LIMIT_ERROR_CODE = 'DAILY_BAN_LIMIT' as const;

export const DAILY_BAN_LIMIT_ERROR =
  '📅 Дневной лимит запретов исчерпан. Попробуй завтра.' as const;

export type CanSendBanCode =
  | typeof INSUFFICIENT_ENERGY_ERROR
  | typeof DAILY_BAN_LIMIT_ERROR_CODE;

export function isInsufficientEnergyMessage(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return false;
  if (trimmed === INSUFFICIENT_ENERGY_ERROR) return true;
  if (trimmed.includes('Выполни пару запретов')) return true;
  return false;
}

export function isDailyBanLimitMessage(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return false;
  if (trimmed === DAILY_BAN_LIMIT_ERROR_CODE) return true;
  if (trimmed === DAILY_BAN_LIMIT_ERROR) return true;
  if (trimmed === LOW_ENERGY_DAILY_LIMIT_ERROR) return true;
  if (trimmed.includes('Дневной лимит запретов')) return true;
  return false;
}

/** Redirect-to-lobby on send failure — insufficient influence / energy only. */
export function isLowEnergySendRejectionMessage(message: string): boolean {
  return isInsufficientEnergyMessage(message);
}

export type CheckOutcome = 'both_yes' | 'both_no' | 'split';

export interface EnergyDelta {
  sender: number;
  receiver: number;
}

/** Penalties are never multiplied */
export function applyRewardMultiplier(delta: number, energy: number): number {
  if (delta <= 0) return delta;
  return Math.round(delta * getRewardMultiplier(energy));
}

export function calcSendCost(): EnergyDelta {
  return { sender: -2, receiver: 0 };
}

export function calcOverboardPenalty(): EnergyDelta {
  return { sender: -8, receiver: -8 };
}

export function calcCheckOutcome(outcome: CheckOutcome): EnergyDelta {
  switch (outcome) {
    case 'both_yes':
      return { sender: 4, receiver: 6 };
    case 'both_no':
      return { sender: 0, receiver: -2 };
    case 'split':
      return { sender: -4, receiver: -6 };
  }
}

export function calcSelfBanReward(isPublic: boolean): number {
  return isPublic ? 3 : 1;
}

/** All bans between a pair today (any status/direction) — energy-free above limit. */
export function isPairDailyFreeMode(bansTodayBetweenPair: number): boolean {
  return bansTodayBetweenPair > PAIR_DAILY_FREE_MODE_BAN_LIMIT;
}

export interface TransientFeedback {
  delta: number;
  label: string;
}
