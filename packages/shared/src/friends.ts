import type { UserPublic } from './types';

export type FriendPresence = 'online' | 'recent' | 'offline';

export type FriendRelation = 'friend' | 'pending';

export type FriendChallengeState =
  | 'none'
  | 'outgoing_pending'
  | 'incoming_pending'
  | 'active';

/** Explicit social graph state (derived from real DB interactions only) */
export type FriendState =
  | 'invited'
  | 'pending'
  | 'active'
  | 'in_challenge'
  | 'offline';

const SYNTHETIC_USERNAME_RE =
  /^(neon_|cyber_|demo_|fake_|ghost_|arena_|test_|mock_)/i;

const SYNTHETIC_USERNAMES = new Set([
  'neon_fox',
  'cyber_wolf',
  'demo_user',
  'demo_fox',
  'share',
]);

export function isSyntheticSocialUsername(username: string): boolean {
  const u = username.replace(/^@/, '').trim().toLowerCase();
  if (!u || u.startsWith('uid:')) return false;
  if (SYNTHETIC_USERNAMES.has(u)) return true;
  return SYNTHETIC_USERNAME_RE.test(u);
}

export function resolveFriendState(
  card: Pick<
    FriendCard,
    'isRegistered' | 'challengeState' | 'hasPendingInvite' | 'presence'
  >,
): FriendState {
  if (!card.isRegistered) return 'invited';
  if (card.challengeState === 'active') return 'in_challenge';
  if (
    card.challengeState === 'incoming_pending' ||
    card.challengeState === 'outgoing_pending' ||
    card.hasPendingInvite
  ) {
    return 'pending';
  }
  if (card.presence === 'online' || card.presence === 'recent') {
    return 'active';
  }
  return 'offline';
}

export function findFriendByUsername(
  friends: FriendCard[] | null | undefined,
  receiver: string,
): FriendCard | undefined {
  const list = coerceFriendList(friends);
  const u = receiver.replace(/^@/, '').trim().toLowerCase();
  if (!u) return undefined;
  return list.find((f) => (f.username ?? '').toLowerCase() === u);
}

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

/** Resolve direct-send ids from friends list + explicit overrides */
export function resolveReceiverTarget(
  receiverUsername: string,
  friends?: FriendCard[] | null,
  explicit?: {
    receiverUserId?: string | null;
    receiverTelegramId?: string | null;
  },
): ResolvedReceiverTarget {
  const username =
    receiverUsername.replace(/^@/, '').trim().toLowerCase() || null;
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

/** Normalize API/WS payloads — never let undefined crash the UI */
export function coerceFriendList(
  input: unknown,
): FriendCard[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => sanitizeFriendCard(item))
    .filter((c): c is FriendCard => c !== null);
}

export function sanitizeFriendCard(raw: unknown): FriendCard | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<FriendCard>;
  const username = String(r.username ?? '')
    .replace(/^@/, '')
    .trim();
  const firstName = String(r.firstName ?? username).trim() || username;
  if (!username || isSyntheticSocialUsername(username)) return null;

  const presence =
    r.presence === 'online' || r.presence === 'recent' ? r.presence : 'offline';

  const userId = r.userId ?? null;
  const telegramId =
    r.telegramId != null ? String(r.telegramId).trim() || null : null;

  const card: FriendCard = {
    id: r.id ?? (userId ? userId : `contact:${username}`),
    userId,
    telegramId,
    username,
    firstName,
    photoUrl: r.photoUrl ?? null,
    auraLabel: r.auraLabel ?? 'Контакт',
    streak: typeof r.streak === 'number' ? r.streak : 0,
    energyPercent:
      typeof r.energyPercent === 'number'
        ? Math.min(100, Math.max(0, r.energyPercent))
        : 0,
    presence,
    lastSeenAt: r.lastSeenAt ?? null,
    interactionCount:
      typeof r.interactionCount === 'number' ? r.interactionCount : 0,
    isRegistered: !!(userId || telegramId || r.isRegistered),
    relation: r.relation,
    hasPendingInvite: !!r.hasPendingInvite,
    challengeState: r.challengeState,
    recentChallenge: r.recentChallenge ?? null,
    underPressure: !!r.underPressure,
  };

  card.friendState =
    r.friendState ??
    resolveFriendState({
      isRegistered: card.isRegistered,
      challengeState: card.challengeState,
      hasPendingInvite: card.hasPendingInvite,
      presence: card.presence,
    });

  return card;
}

export interface FriendCard {
  id: string | null;
  userId: string | null;
  /** Set when contact is a registered Telegram user */
  telegramId?: string | null;
  username: string;
  firstName: string;
  photoUrl: string | null;
  auraLabel: string;
  streak: number;
  energyPercent: number;
  presence: FriendPresence;
  lastSeenAt: string | null;
  interactionCount: number;
  isRegistered: boolean;
  relation?: FriendRelation;
  hasPendingInvite?: boolean;
  challengeState?: FriendChallengeState;
  friendState?: FriendState;
  /** Last ban snippet between you two */
  recentChallenge?: string | null;
  /** High social pressure (energy / activity) */
  underPressure?: boolean;
}

export interface FriendSearchResult {
  username: string;
  isRegistered: boolean;
  user: UserPublic | null;
  canSendBan: boolean;
}

export interface SendBanResponse {
  ban?: import('./types').BanInteraction;
  energyDelta: number;
  /** True when target is not in 98+ — must share via Telegram */
  pending?: boolean;
  requiresShare?: boolean;
  /** Present only when requiresShare / pending invite */
  shareText?: string;
  shareUrl?: string;
}
