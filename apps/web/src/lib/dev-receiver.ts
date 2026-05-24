import {
  findFriendByUsername,
  type FriendCard,
} from '@98plus/shared';
import { isClientDevAuthEnabled } from '@/lib/config';

export const DEV_PEER_USERNAME = 'dev_peer';
export const DEV_SENDER_USERNAME = 'dev_user';

function isSyntheticFriendId(id: string | null | undefined): boolean {
  if (!id) return false;
  return id.startsWith('contact:') || id.startsWith('optimistic');
}

/** Pick dev_peer or first other registered friend (never self). */
export function pickDevReceiverFriend(
  friends: FriendCard[],
  selfUsername?: string | null,
  selfUserId?: string | null,
): FriendCard | undefined {
  const selfU = selfUsername?.replace(/^@/, '').trim().toLowerCase();
  const selfId = selfUserId?.trim();

  const peer = friends.find(
    (f) =>
      f.username?.toLowerCase() === DEV_PEER_USERNAME &&
      f.userId &&
      f.userId !== selfId &&
      !isSyntheticFriendId(f.id),
  );
  if (peer) return peer;

  return friends.find((f) => {
    if (!f.userId || f.userId === selfId) return false;
    if (isSyntheticFriendId(f.id)) return false;
    const u = f.username?.toLowerCase();
    if (!u || u === selfU || u === DEV_SENDER_USERNAME) return false;
    return true;
  });
}

export interface DevSendTarget {
  receiverUsername: string;
  receiverUserId: string | null;
  receiverTelegramId: string | null;
}

/** Normalize send target for local dev — always prefer registered dev_peer. */
export function resolveDevSendTarget(
  friends: FriendCard[],
  sendReceiver: string,
  self?: { username?: string | null; userId?: string | null },
): DevSendTarget | null {
  if (!isClientDevAuthEnabled()) return null;

  const raw = sendReceiver.replace(/^@/, '').trim().toLowerCase();
  const selfU = self?.username?.replace(/^@/, '').trim().toLowerCase();
  const selfId = self?.userId?.trim() ?? null;

  let friend = raw ? findFriendByUsername(friends, raw) : undefined;

  const targetsSelf =
    !friend ||
    friend.userId === selfId ||
    friend.username?.toLowerCase() === selfU ||
    friend.username?.toLowerCase() === DEV_SENDER_USERNAME ||
    isSyntheticFriendId(friend.id) ||
    !friend.userId;

  if (targetsSelf) {
    friend = pickDevReceiverFriend(friends, selfU, selfId);
  }

  if (!friend?.username) return null;

  const receiverUserId =
    friend.userId && !isSyntheticFriendId(friend.id) ? friend.userId : null;

  return {
    receiverUsername: friend.username,
    receiverUserId,
    receiverTelegramId: friend.telegramId?.trim() || null,
  };
}
