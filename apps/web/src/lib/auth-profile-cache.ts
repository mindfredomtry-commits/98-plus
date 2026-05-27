import type { UserPublic } from '@98plus/shared';

function profileKey(telegramId: number | string): string {
  return `98plus_auth_profile:${telegramId}`;
}

export function readAuthProfileCache(
  telegramId: number | string | null | undefined,
): UserPublic | null {
  if (typeof window === 'undefined' || telegramId == null) return null;
  try {
    const raw = localStorage.getItem(profileKey(telegramId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UserPublic>;
    if (!parsed.id || !parsed.telegramId) return null;
    return parsed as UserPublic;
  } catch {
    return null;
  }
}

export function writeAuthProfileCache(user: UserPublic): void {
  if (typeof window === 'undefined' || user.telegramId == null) return;
  try {
    localStorage.setItem(profileKey(user.telegramId), JSON.stringify(user));
  } catch {
    /* ignore quota */
  }
}

export function clearAuthProfileCache(telegramId: number | string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(profileKey(telegramId));
  } catch {
    /* ignore */
  }
}
