import type { BanInteraction, FriendCard, UserPublic } from '@98plus/shared';
import { sanitizeFriendCard } from '@98plus/shared';

function optimisticUserStub(username: string, firstName: string): UserPublic {
  return {
    id: `optimistic-user:${username}`,
    telegramId: '',
    username,
    firstName,
    photoUrl: null,
    aura: 'stable',
    auraLabel: 'Стабильная',
    energyPercent: 0,
    streak: 0,
    isOnboarded: false,
  };
}

/** Optimistic send state until server / WS confirms */
export interface OptimisticSendWait {
  id: string;
  username: string;
  firstName: string;
  banText: string;
  durationMinutes: number;
  createdAt: number;
  expiresAt: number;
  resolved: boolean;
  failed?: boolean;
  errorMessage?: string;
}

export const OPTIMISTIC_SEND_TTL_MS = 90_000;
export const CHECK_WAITING_UI_TTL_MS = 3000;
export const VISUAL_SEND_LOADING_MS = 1_500;

export function normalizeWaitUsername(raw: string): string {
  return raw.replace(/^@/, '').trim().toLowerCase();
}

export function createOptimisticSendWait(params: {
  username: string;
  firstName?: string;
  banText: string;
  durationMinutes: number;
}): OptimisticSendWait {
  const now = Date.now();
  const clean = normalizeWaitUsername(params.username);
  return {
    id: `optimistic-${now}`,
    username: clean,
    firstName: params.firstName?.trim() || clean,
    banText: params.banText.trim(),
    durationMinutes: params.durationMinutes,
    createdAt: now,
    expiresAt: now + OPTIMISTIC_SEND_TTL_MS,
    resolved: false,
  };
}

export function isOptimisticSendWaitActive(
  wait: OptimisticSendWait | null | undefined,
): boolean {
  if (!wait || wait.resolved || wait.failed) return false;
  return Date.now() < wait.expiresAt;
}

export function buildOptimisticFriendCard(
  wait: OptimisticSendWait,
): FriendCard | null {
  if (!wait.username) return null;
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
    hasPendingInvite: true,
    recentChallenge: wait.banText,
  });
}

export function patchFriendWithOptimistic(
  friends: FriendCard[],
  wait: OptimisticSendWait,
  existing?: FriendCard | null,
): FriendCard[] {
  const uname = wait.username;
  const optimistic = buildOptimisticFriendCard(wait);
  if (!optimistic) return friends;

  const withoutDup = friends.filter(
    (f) =>
      !(f.id ?? '').startsWith('optimistic:') ||
      (f.username ?? '').toLowerCase() !== uname,
  );

  const idx = withoutDup.findIndex(
    (f) => (f.username ?? '').toLowerCase() === uname,
  );

  if (idx >= 0) {
    const base = withoutDup[idx];
    const next = [...withoutDup];
    next[idx] = sanitizeFriendCard({
      ...base,
      recentChallenge: wait.banText,
      challengeState: 'outgoing_pending',
      hasPendingInvite: true,
      friendState: 'pending',
    });
    return next;
  }

  if (existing) {
    return [
      sanitizeFriendCard({
        ...existing,
        recentChallenge: wait.banText,
        challengeState: 'outgoing_pending',
        hasPendingInvite: true,
        friendState: 'pending',
      }),
      ...withoutDup.filter(
        (f) => (f.username ?? '').toLowerCase() !== uname,
      ),
    ];
  }

  return [optimistic, ...withoutDup];
}

/** Merge optimistic placeholder; drop when real graph has same user. */
export function mergeFriendsWithOptimistic(
  friends: FriendCard[],
  wait: OptimisticSendWait | null | undefined,
): FriendCard[] {
  if (!isOptimisticSendWaitActive(wait)) return friends;

  const hasReal = friends.some(
    (f) =>
      (f.username ?? '').toLowerCase() === wait!.username &&
      (f.userId != null || f.isRegistered) &&
      f.challengeState !== 'outgoing_pending',
  );
  if (hasReal) return friends.filter((f) => !(f.id ?? '').startsWith('optimistic:'));

  return patchFriendWithOptimistic(friends, wait!);
}

export function removeOptimisticFriends(
  friends: FriendCard[],
  username?: string,
): FriendCard[] {
  const u = username ? normalizeWaitUsername(username) : null;
  return friends.filter((f) => {
    const id = f.id ?? '';
    if (id.startsWith('optimistic:')) {
      if (!u) return false;
      return (f.username ?? '').toLowerCase() !== u;
    }
    return true;
  });
}

export function buildOptimisticBanInteraction(
  wait: OptimisticSendWait,
): BanInteraction {
  const receiver = optimisticUserStub(wait.username, wait.firstName);
  return {
    id: `optimistic-ban:${wait.id}`,
    text: wait.banText,
    status: 'pending',
    durationMinutes: wait.durationMinutes as BanInteraction['durationMinutes'],
    sender: optimisticUserStub('me', 'Я'),
    receiver,
    isIncoming: false,
    createdAt: new Date().toISOString(),
    expiresAt: null,
    checkDueAt: null,
    threadId: `optimistic-thread:${wait.id}`,
    remainingMs: wait.durationMinutes * 60_000,
    serverNow: new Date().toISOString(),
  };
}

export function mergeActiveBansWithOptimistic(
  active: BanInteraction[],
  wait: OptimisticSendWait | null | undefined,
): BanInteraction[] {
  if (!isOptimisticSendWaitActive(wait)) {
    return active.filter((b) => !b.id.startsWith('optimistic-ban:'));
  }
  const id = `optimistic-ban:${wait!.id}`;
  const without = active.filter((b) => !b.id.startsWith('optimistic-ban:'));
  if (without.some((b) => b.id === id)) return without;
  return [buildOptimisticBanInteraction(wait!), ...without];
}

export function replaceOptimisticBan(
  active: BanInteraction[],
  realBan: BanInteraction | undefined,
  optimisticId: string,
): BanInteraction[] {
  const without = active.filter(
    (b) => b.id !== optimisticId && !b.id.startsWith('optimistic-ban:'),
  );
  if (!realBan) return without;
  if (without.some((b) => b.id === realBan.id)) return without;
  return [realBan, ...without];
}
