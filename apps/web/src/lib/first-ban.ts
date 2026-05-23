const FIRST_BAN_KEY = '98plus_first_ban_sent';

export function isFirstBanComplete(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(FIRST_BAN_KEY) === '1';
  } catch {
    return false;
  }
}

export function markFirstBanComplete(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(FIRST_BAN_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function shouldShowFirstBanOnboarding(
  friendCount: number,
  isOnboarded?: boolean,
): boolean {
  if (isOnboarded) return false;
  if (isFirstBanComplete()) return false;
  return friendCount === 0;
}
