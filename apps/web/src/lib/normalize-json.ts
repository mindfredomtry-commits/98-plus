import type { BanInteraction, BanResult, UserPublic } from '@98plus/shared';
import { normalizeBanTone, normalizeNotificationMode } from '@98plus/shared';

/** Coerce ban/user ids to stable string keys for Sets, localStorage, and JSON. */
export function normalizeId(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'bigint') {
    console.log('[bigint-serialization-source]', {
      source: 'normalizeId',
      field: 'id',
    });
    return value.toString();
  }
  const text = String(value).trim();
  return text;
}

export function normalizeUserPublic(user: UserPublic): UserPublic {
  return {
    ...user,
    id: normalizeId(user.id),
    telegramId: normalizeId(user.telegramId),
    notificationMode: normalizeNotificationMode(user.notificationMode),
  };
}

export function normalizeBanInteraction(ban: BanInteraction): BanInteraction {
  return {
    ...ban,
    id: normalizeId(ban.id),
    threadId: normalizeId(ban.threadId),
    tone: ban.tone === undefined ? ban.tone : normalizeBanTone(ban.tone),
    sender: normalizeUserPublic(ban.sender),
    receiver: normalizeUserPublic(ban.receiver),
  };
}

export function normalizeBanResult(result: BanResult): BanResult {
  return {
    ...result,
    id: normalizeId(result.id),
    viewerId: result.viewerId ? normalizeId(result.viewerId) : null,
    tone: result.tone === undefined ? result.tone : normalizeBanTone(result.tone),
    sender: normalizeUserPublic(result.sender),
    receiver: normalizeUserPublic(result.receiver),
    opponent: normalizeUserPublic(result.opponent),
  };
}

export function normalizeQueuedOverlay<T extends { kind: string }>(
  item: T,
): T {
  if (item.kind === 'result' && 'result' in item) {
    const row = item as T & { result: BanResult };
    return {
      ...item,
      result: normalizeBanResult(row.result),
    };
  }
  if ('ban' in item) {
    const row = item as T & { ban: BanInteraction };
    return {
      ...item,
      ban: normalizeBanInteraction(row.ban),
    };
  }
  return item;
}

const jsonReplacer = (key: string, value: unknown): unknown => {
  if (typeof value === 'bigint') {
    console.log('[bigint-serialization-source]', { source: 'safeStringify', field: key });
    return value.toString();
  }
  return value;
};

/** JSON.stringify that never throws on BigInt values. */
export function safeStringify(value: unknown): string {
  return JSON.stringify(value, jsonReplacer);
}

export function safeJsonBody(value: unknown): string {
  return safeStringify(value);
}
