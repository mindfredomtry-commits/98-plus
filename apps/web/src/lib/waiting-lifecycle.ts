import type { FriendCard } from '@98plus/shared';
import { sanitizeFriendCard } from '@98plus/shared';

/** Short-lived optimistic row after sending a challenge (not persisted). */
export interface OptimisticSendWait {
  username: string;
  firstName: string;
  createdAt: number;
  expiresAt: number;
  resolved: boolean;
}

export const OPTIMISTIC_SEND_TTL_MS = 2500;
export const CHECK_WAITING_UI_TTL_MS = 3000;

export function normalizeWaitUsername(raw: string): string {
  return raw.replace(/^@/, '').trim().toLowerCase();
}

export function createOptimisticSendWait(
  username: string,
  firstName?: string,
): OptimisticSendWait {
  const now = Date.now();
  const clean = normalizeWaitUsername(username);
  return {
    username: clean,
    firstName: firstName?.trim() || clean,
    createdAt: now,
    expiresAt: now + OPTIMISTIC_SEND_TTL_MS,
    resolved: false,
  };
}

export function isOptimisticSendWaitActive(
  wait: OptimisticSendWait | null | undefined,
): boolean {
  if (!wait || wait.resolved) return false;
  return Date.now() < wait.expiresAt;
}

export function buildOptimisticFriendCard(
  wait: OptimisticSendWait,
): FriendCard | null {
  return sanitizeFriendCard({
    id: `optimistic:${wait.username}:${wait.createdAt}`,
    userId: null,
    username: wait.username,
    firstName: wait.firstName,
    photoUrl: null,
    auraLabel: 'Отправка',
    streak: 0,
    energyPercent: 0,
    presence: 'offline',
    lastSeenAt: null,
    interactionCount: 0,
    isRegistered: false,
    relation: 'pending',
    friendState: 'pending',
    challengeState: 'outgoing_pending',
    hasPendingInvite: false,
    recentChallenge: null,
  });
}

/** Merge optimistic placeholder; drop when real graph has same user. */
export function mergeFriendsWithOptimistic(
  friends: FriendCard[],
  wait: OptimisticSendWait | null | undefined,
): FriendCard[] {
  const list = [...friends];
  if (!isOptimisticSendWaitActive(wait)) return list;

  const optimistic = buildOptimisticFriendCard(wait!);
  if (!optimistic) return list;

  const hasReal = list.some(
    (f) =>
      (f.username ?? '').toLowerCase() === wait!.username &&
      (f.userId != null || f.isRegistered),
  );
  if (hasReal) return list;

  const withoutDup = list.filter(
    (f) => (f.username ?? '').toLowerCase() !== wait!.username,
  );
  return [optimistic, ...withoutDup];
}
