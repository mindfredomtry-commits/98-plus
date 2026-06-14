export type ReplyDeeplinkActionResult = 'reply_ban_overboard' | 'reply_ban_sent';

export const REPLY_DEEPLINK_TOAST_OVERBOARD = '⚠️ Был перебор';
export const REPLY_DEEPLINK_TOAST_SENT = '🚫 Запрет уже отправлен';

const LEGACY_STORAGE_PREFIX = '98plus_reply_deeplink_action:';

export function replyDeeplinkStorageKey(
  userId: string,
  banId: string,
): string {
  return `${LEGACY_STORAGE_PREFIX}${userId.trim()}:${banId.trim()}`;
}

function storageKey(userId: string, banId: string): string {
  return replyDeeplinkStorageKey(userId, banId);
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
    const raw = localStorage.getItem(`${LEGACY_STORAGE_PREFIX}${userId.trim()}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const row = parsed.find(
      (item) =>
        !!item &&
        typeof item === 'object' &&
        (item as { banId?: string }).banId === banId.trim(),
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
  const uid = userId?.trim() ?? '';
  const bid = banId?.trim() ?? '';
  if (!uid || !bid) return null;

  if (typeof window === 'undefined') return null;

  const key = storageKey(uid, bid);
  let result: ReplyDeeplinkActionResult | null = null;

  try {
    const direct = localStorage.getItem(key);
    if (isReplyDeeplinkActionResult(direct)) {
      result = direct;
    }
  } catch {
    /* ignore */
  }

  if (!result) {
    const legacy = readLegacyRow(uid, bid);
    if (legacy) {
      migrateLegacyRow(uid, bid, legacy);
      result = legacy;
    }
  }

  console.log('[reply-result-read]', {
    userId: uid,
    banId: bid,
    key,
    result,
  });

  return result;
}

export function markReplyDeeplinkOverboard(
  userId: string | null | undefined,
  banId: string | null | undefined,
): void {
  const uid = userId?.trim() ?? '';
  const bid = banId?.trim() ?? '';
  if (!uid || !bid) return;
  if (typeof window === 'undefined') return;
  const key = storageKey(uid, bid);
  localStorage.setItem(key, 'reply_ban_overboard');
  console.log('[reply-result-write]', {
    kind: 'reply_ban_overboard',
    userId: uid,
    banId: bid,
    key,
  });
}

export function markReplyDeeplinkSent(
  userId: string | null | undefined,
  banId: string | null | undefined,
): void {
  const uid = userId?.trim() ?? '';
  const bid = banId?.trim() ?? '';
  if (!uid || !bid) return;
  if (typeof window === 'undefined') return;
  const key = storageKey(uid, bid);
  localStorage.setItem(key, 'reply_ban_sent');
  console.log('[reply-result-write]', {
    kind: 'reply_ban_sent',
    userId: uid,
    banId: bid,
    key,
  });
}

export function clearReplyDeeplinkActionResult(
  userId: string | null | undefined,
  banId: string | null | undefined,
): void {
  const uid = userId?.trim() ?? '';
  const bid = banId?.trim() ?? '';
  if (!uid || !bid) return;
  if (typeof window === 'undefined') return;
  localStorage.removeItem(storageKey(uid, bid));
}
