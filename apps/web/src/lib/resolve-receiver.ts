import { findFriendByUsername, type FriendCard } from '@98plus/shared';

export interface ResolvedReceiverTarget {
  receiverUserId: string | null;
  receiverTelegramId: string | null;
  username: string | null;
  isRegistered: boolean;
}

export const EMPTY_RESOLVED_RECEIVER: ResolvedReceiverTarget = {
  receiverUserId: null,
  receiverTelegramId: null,
  username: null,
  isRegistered: false,
};

function normalizeUsername(raw: string): string | null {
  const u = raw.replace(/^@/, '').trim().toLowerCase();
  return u || null;
}

/** Canonical resolver for web (mirrors @98plus/shared/src/friends.ts). */
export function resolveReceiverTarget(
  receiverUsername: string,
  friends?: FriendCard[] | null,
  explicit?: {
    receiverUserId?: string | null;
    receiverTelegramId?: string | null;
  },
): ResolvedReceiverTarget {
  const username = normalizeUsername(receiverUsername);
  const friend = findFriendByUsername(friends, receiverUsername);
  const receiverUserId =
    explicit?.receiverUserId?.trim() ||
    friend?.userId?.trim() ||
    null;
  const receiverTelegramId =
    explicit?.receiverTelegramId?.trim() ||
    friend?.telegramId?.trim() ||
    null;
  const isRegistered = Boolean(
    receiverUserId ||
      receiverTelegramId ||
      friend?.isRegistered,
  );
  return {
    receiverUserId,
    receiverTelegramId,
    username: friend?.username ?? username,
    isRegistered,
  };
}

/** Never throws — safe for render paths (SendBanDock useMemo). */
export function safeResolveReceiverTarget(
  receiverUsername: string,
  friends?: FriendCard[] | null,
  explicit?: {
    receiverUserId?: string | null;
    receiverTelegramId?: string | null;
  },
): ResolvedReceiverTarget {
  const fallbackUsername = normalizeUsername(receiverUsername);
  try {
    if (typeof resolveReceiverTarget !== 'function') {
      return { ...EMPTY_RESOLVED_RECEIVER, username: fallbackUsername };
    }
    const out = resolveReceiverTarget(receiverUsername, friends, explicit);
    return {
      receiverUserId: out.receiverUserId ?? null,
      receiverTelegramId: out.receiverTelegramId ?? null,
      username: out.username ?? fallbackUsername,
      isRegistered: Boolean(out.isRegistered),
    };
  } catch {
    return { ...EMPTY_RESOLVED_RECEIVER, username: fallbackUsername };
  }
}
