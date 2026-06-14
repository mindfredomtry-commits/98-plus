export type ReplyDeeplinkActionResult = 'reply_ban_overboard' | 'reply_ban_sent';

export const REPLY_DEEPLINK_TOAST_OVERBOARD = '⚠️ Был перебор';
export const REPLY_DEEPLINK_TOAST_SENT = '🚫 Запрет уже отправлен';

const LEGACY_STORAGE_PREFIX = '98plus_reply_deeplink_action:';

function storageKey(userId: string, banId: string): string {
  return `${LEGACY_STORAGE_PREFIX}${userId}:${banId}`;
}

function isReplyDeeplinkActionResult(
  value: unknown,
): value is ReplyDeeplinkActionResult {
  return value === 'reply_ban_overboard' || value === 'reply_ban_sent';
}

function readLegacyRow(
  userId: string,
  banId: string,
): ReplyDeeplinkActionResult | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${LEGACY_STORAGE_PREFIX}${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const row = parsed.find(
      (item) =>
        !!item &&
        typeof item === 'object' &&
        (item as { banId?: string }).banId === banId,
    ) as { result?: unknown } | undefined;
    return isReplyDeeplinkActionResult(row?.result) ? row.result : null;
  } catch {
    return null;
  }
}

function migrateLegacyRow(
  userId: string,
  banId: string,
  result: ReplyDeeplinkActionResult,
): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(storageKey(userId, banId), result);
}

export function getReplyDeeplinkActionResult(
  userId: string | null | undefined,
  banId: string | null | undefined,
): ReplyDeeplinkActionResult | null {
  if (!userId?.trim() || !banId?.trim()) return null;

  if (typeof window === 'undefined') return null;

  try {
    const direct = localStorage.getItem(storageKey(userId, banId));
    if (isReplyDeeplinkActionResult(direct)) {
      return direct;
    }
  } catch {
    /* ignore */
  }

  const legacy = readLegacyRow(userId, banId);
  if (legacy) {
    migrateLegacyRow(userId, banId, legacy);
  }
  return legacy;
}

export function markReplyDeeplinkOverboard(
  userId: string | null | undefined,
  banId: string | null | undefined,
): void {
  if (!userId?.trim() || !banId?.trim()) return;
  if (typeof window === 'undefined') return;
  localStorage.setItem(storageKey(userId, banId), 'reply_ban_overboard');
}

export function markReplyDeeplinkSent(
  userId: string | null | undefined,
  banId: string | null | undefined,
): void {
  if (!userId?.trim() || !banId?.trim()) return;
  if (typeof window === 'undefined') return;
  localStorage.setItem(storageKey(userId, banId), 'reply_ban_sent');
}

export function clearReplyDeeplinkActionResult(
  userId: string | null | undefined,
  banId: string | null | undefined,
): void {
  if (!userId?.trim() || !banId?.trim()) return;
  if (typeof window === 'undefined') return;
  localStorage.removeItem(storageKey(userId, banId));
}
