import { LOW_ENERGY_THRESHOLD } from './constants';

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

export interface TransientFeedback {
  delta: number;
  label: string;
}
