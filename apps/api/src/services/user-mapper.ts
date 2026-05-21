import {
  ENERGY_MAX_DISPLAY,
  getAuraLevel,
  AURA_LABELS,
  type UserPublic,
} from '@98plus/shared';
import type { User } from '@prisma/client';

export function mapUser(user: User): UserPublic {
  const aura = getAuraLevel(user.energy);
  return {
    id: user.id,
    telegramId: user.telegramId.toString(),
    username: user.username,
    firstName: user.firstName,
    photoUrl: user.photoUrl,
    aura,
    auraLabel: AURA_LABELS[aura],
    energyPercent: Math.min(
      100,
      Math.round((user.energy / ENERGY_MAX_DISPLAY) * 100),
    ),
    streak: user.streak,
    isOnboarded: user.isOnboarded,
  };
}
