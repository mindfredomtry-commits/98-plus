const HINT_KEY_PREFIX = '98plus_lobby_bans_attention_';

function hintKey(userId: string): string {
  return `${HINT_KEY_PREFIX}${userId.trim()}`;
}

export function readLobbyNotificationAttentionHint(userId: string): number {
  if (typeof localStorage === 'undefined') return 0;
  try {
    const raw = localStorage.getItem(hintKey(userId));
    if (!raw) return 0;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function persistLobbyNotificationAttentionHint(
  userId: string,
  count: number,
): void {
  if (typeof localStorage === 'undefined') return;
  const key = hintKey(userId);
  try {
    if (count > 0) {
      localStorage.setItem(key, String(count));
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    /* ignore quota */
  }
}

export function clearLobbyNotificationAttentionHint(userId: string): void {
  persistLobbyNotificationAttentionHint(userId, 0);
}
