import { normalizeAvatarUrl } from './avatar-url';

const friendAvatars = new Map<string, string>();
const userAvatars = new Map<string, string>();

function friendKeys(
  id: string | null | undefined,
  userId: string | null | undefined,
): string[] {
  const keys: string[] = [];
  if (userId) keys.push(`u:${userId}`);
  if (id) keys.push(`f:${id}`);
  return keys;
}

export function clearAvatarCaches(): void {
  friendAvatars.clear();
  userAvatars.clear();
}

export function rememberFriendAvatar(
  id: string | null | undefined,
  userId: string | null | undefined,
  url: string | null | undefined,
): void {
  const normalized = normalizeAvatarUrl(url);
  if (!normalized) return;
  for (const key of friendKeys(id, userId)) {
    friendAvatars.set(key, normalized);
  }
}

export function getCachedFriendAvatar(
  id: string | null | undefined,
  userId: string | null | undefined,
): string | null {
  for (const key of friendKeys(id, userId)) {
    const hit = friendAvatars.get(key);
    if (hit) return hit;
  }
  return null;
}

export function resolveFriendAvatarUrl(
  friend:
    | {
        id?: string | null;
        userId?: string | null;
        avatarUrl?: string | null;
        photoUrl?: string | null;
      }
    | null
    | undefined,
): string | null {
  if (!friend) return null;
  const fromFields = normalizeAvatarUrl(
    friend.avatarUrl ?? friend.photoUrl,
  );
  if (fromFields) {
    rememberFriendAvatar(friend.id, friend.userId, fromFields);
    return fromFields;
  }
  return getCachedFriendAvatar(friend.id, friend.userId);
}

export function rememberUserAvatar(
  userId: string | null | undefined,
  url: string | null | undefined,
): void {
  const normalized = normalizeAvatarUrl(url);
  if (userId && normalized) userAvatars.set(userId, normalized);
}

export function resolveUserAvatarUrl(
  user:
    | {
        id?: string;
        photoUrl?: string | null;
        avatarUrl?: string | null;
      }
    | null
    | undefined,
): string | null {
  if (!user?.id) {
    return normalizeAvatarUrl(user?.photoUrl ?? user?.avatarUrl);
  }
  const fromFields = normalizeAvatarUrl(user.avatarUrl ?? user.photoUrl);
  if (fromFields) {
    userAvatars.set(user.id, fromFields);
    return fromFields;
  }
  return userAvatars.get(user.id) ?? null;
}
