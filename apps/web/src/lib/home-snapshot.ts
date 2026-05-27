import type { FriendCard, UserPublic, BanInteraction } from '@98plus/shared';
import { coerceFriendList } from '@98plus/shared';

const SNAPSHOT_VERSION = 2 as const;
const SNAPSHOT_VERSION_LEGACY = 1 as const;

export type HomeSnapshotUser = Pick<
  UserPublic,
  | 'id'
  | 'username'
  | 'firstName'
  | 'energy'
  | 'energyPercent'
  | 'telegramId'
  | 'photoUrl'
  | 'avatarUrl'
  | 'isOnboarded'
>;

export interface HomeSnapshot {
  version: typeof SNAPSHOT_VERSION;
  ownerUserId: string;
  savedAt: string;
  friends: FriendCard[];
  user: HomeSnapshotUser;
  sendDuration: number;
  sendReceiver: string;
  activeBansCount: number;
  checkBan?: BanInteraction | null;
}

function snapshotKey(userId: string): string {
  return `98plus_home_snapshot:${userId}`;
}

export function readHomeSnapshot(userId: string): HomeSnapshot | null {
  if (typeof window === 'undefined' || !userId) return null;
  try {
    const raw = localStorage.getItem(snapshotKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<HomeSnapshot>;
    if (
      parsed.version !== SNAPSHOT_VERSION &&
      parsed.version !== SNAPSHOT_VERSION_LEGACY
    ) {
      return null;
    }
    if (parsed.ownerUserId !== userId) return null;
    if (!parsed.user?.id || parsed.user.id !== userId) return null;

    return {
      version: SNAPSHOT_VERSION,
      ownerUserId: userId,
      savedAt: parsed.savedAt ?? new Date(0).toISOString(),
      friends: coerceFriendList(parsed.friends),
      user: parsed.user as HomeSnapshotUser,
      sendDuration:
        typeof parsed.sendDuration === 'number' ? parsed.sendDuration : 10,
      sendReceiver:
        typeof parsed.sendReceiver === 'string' ? parsed.sendReceiver : '',
      activeBansCount:
        typeof parsed.activeBansCount === 'number' ? parsed.activeBansCount : 0,
      checkBan:
        parsed.checkBan &&
        typeof parsed.checkBan === 'object' &&
        typeof (parsed.checkBan as BanInteraction).id === 'string'
          ? (parsed.checkBan as BanInteraction)
          : null,
    };
  } catch {
    return null;
  }
}

export function writeHomeSnapshot(
  userId: string,
  data: {
    friends: FriendCard[];
    user: UserPublic | null | undefined;
    sendDuration: number;
    sendReceiver: string;
    activeBansCount: number;
    checkBan?: BanInteraction | null;
  },
): void {
  if (typeof window === 'undefined' || !userId || !data.user?.id) return;
  if (data.user.id !== userId) return;

  const snapshot: HomeSnapshot = {
    version: SNAPSHOT_VERSION,
    ownerUserId: userId,
    savedAt: new Date().toISOString(),
    friends: coerceFriendList(data.friends),
    user: {
      id: data.user.id,
      username: data.user.username,
      firstName: data.user.firstName,
      energy: data.user.energy,
      energyPercent: data.user.energyPercent,
      telegramId: data.user.telegramId,
      photoUrl: data.user.photoUrl,
      avatarUrl: data.user.avatarUrl,
      isOnboarded: data.user.isOnboarded,
    },
    sendDuration: data.sendDuration,
    sendReceiver: data.sendReceiver,
    activeBansCount: data.activeBansCount,
    checkBan:
      data.checkBan?.status === 'checking' ? data.checkBan : null,
  };

  try {
    localStorage.setItem(snapshotKey(userId), JSON.stringify(snapshot));
  } catch {
    /* ignore quota */
  }
}

export function clearHomeSnapshot(userId: string): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    localStorage.removeItem(snapshotKey(userId));
  } catch {
    /* ignore */
  }
}
