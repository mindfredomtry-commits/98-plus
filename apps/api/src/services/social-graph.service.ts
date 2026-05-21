import type { FriendCard } from '@98plus/shared';
import {
  AURA_LABELS,
  getAuraLevel,
  isSyntheticSocialUsername,
  resolveFriendState,
} from '@98plus/shared';
import { prisma } from '../lib/prisma';
import { normalizeUsername } from './invite.service';
import { getPresenceBatch } from './presence.service';

export type SocialSource =
  | 'CHALLENGE_SENT'
  | 'CHALLENGE_RECEIVED'
  | 'INVITE_SENT'
  | 'INVITE_CLAIMED'
  | 'SHARE_TARGET';

export async function recordSocialContact(
  ownerId: string,
  data: {
    username: string;
    contactUserId?: string | null;
    firstName?: string | null;
    photoUrl?: string | null;
    recentChallenge?: string | null;
    source: SocialSource;
  },
) {
  const contactUsername = normalizeUsername(data.username);
  if (!contactUsername || isSyntheticSocialUsername(contactUsername)) return;

  let firstName = data.firstName?.trim() || contactUsername;
  let photoUrl = data.photoUrl ?? null;
  let contactUserId = data.contactUserId ?? null;

  if (contactUserId) {
    const u = await prisma.user.findUnique({ where: { id: contactUserId } });
    if (u) {
      firstName = u.firstName;
      photoUrl = u.photoUrl;
    }
  } else {
    const u = await prisma.user.findFirst({
      where: { username: { equals: contactUsername, mode: 'insensitive' } },
    });
    if (u) {
      contactUserId = u.id;
      firstName = u.firstName;
      photoUrl = u.photoUrl;
    }
  }

  const snippet = data.recentChallenge
    ? data.recentChallenge.length > 42
      ? `${data.recentChallenge.slice(0, 42)}…`
      : data.recentChallenge
    : null;

  await prisma.socialContact.upsert({
    where: {
      ownerId_contactUsername: { ownerId, contactUsername },
    },
    create: {
      ownerId,
      contactUserId,
      contactUsername,
      contactFirstName: firstName,
      contactPhotoUrl: photoUrl,
      lastChallengeText: snippet,
      interactionCount: 1,
      lastInteractionAt: new Date(),
      lastSource: data.source,
    },
    update: {
      ...(contactUserId ? { contactUserId } : {}),
      contactFirstName: firstName,
      contactPhotoUrl: photoUrl,
      lastChallengeText: snippet ?? undefined,
      interactionCount: { increment: 1 },
      lastInteractionAt: new Date(),
      lastSource: data.source,
    },
  });
}

/** Link username-only contacts when that person registers */
export async function linkContactsForRegisteredUser(user: {
  id: string;
  username: string | null;
  firstName: string;
  photoUrl: string | null;
}) {
  if (user.username) {
    const clean = normalizeUsername(user.username);
    await prisma.socialContact.updateMany({
      where: {
        contactUsername: clean,
        OR: [{ contactUserId: null }, { contactUserId: { not: user.id } }],
      },
      data: {
        contactUserId: user.id,
        contactFirstName: user.firstName,
        contactPhotoUrl: user.photoUrl,
      },
    });
  }

  await prisma.socialContact.updateMany({
    where: { contactUserId: user.id },
    data: {
      contactFirstName: user.firstName,
      contactPhotoUrl: user.photoUrl,
    },
  });
}

/** After invite claim / first login — upgrade all edges to registered user */
export async function materializeRegisteredUser(user: {
  id: string;
  username: string | null;
  firstName: string;
  photoUrl: string | null;
}) {
  await linkContactsForRegisteredUser(user);

  const contactKey = user.username
    ? normalizeUsername(user.username)
    : `uid:${user.id}`;

  const bans = await prisma.ban.findMany({
    where: { OR: [{ senderId: user.id }, { receiverId: user.id }] },
    orderBy: { createdAt: 'desc' },
    take: 80,
    include: { sender: true, receiver: true },
  });

  for (const b of bans) {
    const ownerId = b.senderId === user.id ? b.receiverId : b.senderId;
    await recordSocialContact(ownerId, {
      username: contactKey,
      contactUserId: user.id,
      firstName: user.firstName,
      photoUrl: user.photoUrl,
      recentChallenge: b.text,
      source: b.senderId === user.id ? 'CHALLENGE_SENT' : 'CHALLENGE_RECEIVED',
    });
  }

  const claimedInvites = await prisma.banInvite.findMany({
    where: { claimedById: user.id, status: 'CLAIMED' },
    include: { sender: true },
    take: 40,
  });

  for (const inv of claimedInvites) {
    await recordSocialContact(inv.senderId, {
      username: contactKey,
      contactUserId: user.id,
      firstName: user.firstName,
      photoUrl: user.photoUrl,
      recentChallenge: inv.text,
      source: 'INVITE_CLAIMED',
    });
    if (inv.targetUsername !== contactKey && user.username) {
      await prisma.socialContact.deleteMany({
        where: {
          ownerId: inv.senderId,
          contactUsername: inv.targetUsername,
          contactUserId: null,
        },
      });
    }
  }
}

/** Backfill graph from historical bans/invites (idempotent upserts) */
export async function syncSocialGraphFromHistory(userId: string) {
  const bans = await prisma.ban.findMany({
    where: { OR: [{ senderId: userId }, { receiverId: userId }] },
    orderBy: { createdAt: 'desc' },
    take: 120,
    include: { sender: true, receiver: true },
  });

  for (const b of bans) {
    const isSender = b.senderId === userId;
    const other = isSender ? b.receiver : b.sender;
    const contactKey = other.username
      ? normalizeUsername(other.username)
      : `uid:${other.id}`;
    if (!contactKey || isSyntheticSocialUsername(contactKey)) continue;
    await recordSocialContact(userId, {
      username: contactKey,
      contactUserId: other.id,
      firstName: other.firstName,
      photoUrl: other.photoUrl,
      recentChallenge: b.text,
      source: isSender ? 'CHALLENGE_SENT' : 'CHALLENGE_RECEIVED',
    });
  }

  const sentInvites = await prisma.banInvite.findMany({
    where: { senderId: userId },
    orderBy: { createdAt: 'desc' },
    take: 40,
  });

  for (const inv of sentInvites) {
    if (isSyntheticSocialUsername(inv.targetUsername)) continue;
    const claimedUser = inv.claimedById
      ? await prisma.user.findUnique({ where: { id: inv.claimedById } })
      : null;
    await recordSocialContact(userId, {
      username: claimedUser?.username
        ? normalizeUsername(claimedUser.username)
        : inv.targetUsername,
      contactUserId: inv.claimedById ?? undefined,
      firstName: claimedUser?.firstName,
      photoUrl: claimedUser?.photoUrl,
      recentChallenge: inv.text,
      source: inv.claimedById ? 'INVITE_CLAIMED' : 'INVITE_SENT',
    });
  }

  const claimed = await prisma.banInvite.findMany({
    where: { claimedById: userId },
    orderBy: { claimedAt: 'desc' },
    take: 40,
    include: { sender: true },
  });

  const me = await prisma.user.findUnique({ where: { id: userId } });

  for (const inv of claimed) {
    await recordSocialContact(userId, {
      username: inv.sender.username ?? inv.sender.firstName,
      contactUserId: inv.sender.id,
      firstName: inv.sender.firstName,
      photoUrl: inv.sender.photoUrl,
      recentChallenge: inv.text,
      source: 'INVITE_CLAIMED',
    });
    if (me?.username) {
      await recordSocialContact(inv.senderId, {
        username: me.username,
        contactUserId: userId,
        firstName: me.firstName,
        photoUrl: me.photoUrl,
        recentChallenge: inv.text,
        source: 'INVITE_CLAIMED',
      });
    }
  }
}

async function getRelationshipOverlay(
  ownerId: string,
  contactUserId: string | null,
  contactUsername: string,
): Promise<{
  challengeState: FriendCard['challengeState'];
  hasPendingInvite: boolean;
  recentChallenge: string | null;
}> {
  let challengeState: FriendCard['challengeState'] = 'none';
  let hasPendingInvite = false;
  let recentChallenge: string | null = null;

  if (contactUserId) {
    const latestBan = await prisma.ban.findFirst({
      where: {
        OR: [
          { senderId: ownerId, receiverId: contactUserId },
          { senderId: contactUserId, receiverId: ownerId },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
    if (latestBan) {
      recentChallenge =
        latestBan.text.length > 42
          ? `${latestBan.text.slice(0, 42)}…`
          : latestBan.text;
      if (latestBan.status === 'PENDING') {
        if (latestBan.receiverId === ownerId) challengeState = 'incoming_pending';
        else challengeState = 'outgoing_pending';
      } else if (
        latestBan.status === 'ACTIVE' ||
        latestBan.status === 'CHECKING'
      ) {
        challengeState = 'active';
      }
    }
  }

  const pendingInvite = await prisma.banInvite.findFirst({
    where: {
      senderId: ownerId,
      targetUsername: normalizeUsername(contactUsername),
      status: 'PENDING',
    },
    orderBy: { createdAt: 'desc' },
  });

  if (pendingInvite) {
    hasPendingInvite = true;
    challengeState = 'outgoing_pending';
    recentChallenge =
      pendingInvite.text.length > 42
        ? `${pendingInvite.text.slice(0, 42)}…`
        : pendingInvite.text;
  }

  return { challengeState, hasPendingInvite, recentChallenge };
}

async function purgeSyntheticContacts(ownerId: string) {
  const contacts = await prisma.socialContact.findMany({
    where: { ownerId },
    select: { id: true, contactUsername: true },
  });
  const ids = contacts
    .filter((c) => isSyntheticSocialUsername(c.contactUsername))
    .map((c) => c.id);
  if (ids.length > 0) {
    await prisma.socialContact.deleteMany({ where: { id: { in: ids } } });
  }
}

export async function listSocialGraph(userId: string): Promise<FriendCard[]> {
  await purgeSyntheticContacts(userId);
  await syncSocialGraphFromHistory(userId);
  await purgeSyntheticContacts(userId);

  const contacts = await prisma.socialContact.findMany({
    where: { ownerId: userId },
    orderBy: { lastInteractionAt: 'desc' },
    take: 50,
    include: { contactUser: true },
  });

  const cards: (FriendCard & { lastAt: Date })[] = [];

  for (const c of contacts) {
    if (isSyntheticSocialUsername(c.contactUsername)) continue;

    const live = c.contactUser;
    const userIdLinked = live?.id ?? c.contactUserId;
    const overlay = await getRelationshipOverlay(
      userId,
      userIdLinked,
      c.contactUsername,
    );

    const firstName = (live?.firstName ?? c.contactFirstName ?? '').trim();
    const photoUrl = live?.photoUrl ?? c.contactPhotoUrl;
    const username = (
      live?.username?.trim() ||
      (c.contactUsername.startsWith('uid:')
        ? firstName
        : c.contactUsername)
    ).trim();
    if (!username || !firstName) continue;
    const energy = live?.energy ?? 0;
    const streak = live?.streak ?? 0;
    const aura = getAuraLevel(energy);

    const cardBase = {
      id: userIdLinked ?? `contact:${c.contactUsername}`,
      userId: userIdLinked,
      telegramId: live?.telegramId?.toString() ?? null,
      username,
      firstName,
      photoUrl,
      auraLabel: live ? AURA_LABELS[aura] : 'Контакт',
      streak,
      energyPercent: live
        ? Math.min(100, Math.round((energy / 150) * 100))
        : 0,
      presence: 'offline' as const,
      lastSeenAt: live?.lastSeenAt?.toISOString() ?? null,
      interactionCount: c.interactionCount,
      isRegistered: !!(userIdLinked || live?.telegramId),
      relation:
        userIdLinked || live?.telegramId
          ? ('friend' as const)
          : ('pending' as const),
      challengeState: overlay.challengeState,
      recentChallenge:
        overlay.recentChallenge ?? c.lastChallengeText,
      hasPendingInvite: overlay.hasPendingInvite,
      underPressure: live ? energy >= 85 || streak >= 3 : false,
      lastAt: c.lastInteractionAt,
    };

    cards.push({
      ...cardBase,
      friendState: resolveFriendState({
        isRegistered: cardBase.isRegistered,
        challengeState: cardBase.challengeState,
        hasPendingInvite: cardBase.hasPendingInvite,
        presence: cardBase.presence,
      }),
    });
  }

  const presence = await getPresenceBatch(
    cards.filter((f) => f.userId).map((f) => f.userId!),
  );

  return cards
    .map((f) => {
      const presenceVal = f.userId
        ? (presence[f.userId] ?? 'offline')
        : 'offline';
      return {
        ...f,
        presence: presenceVal,
        friendState: resolveFriendState({
          isRegistered: f.isRegistered,
          challengeState: f.challengeState,
          hasPendingInvite: f.hasPendingInvite,
          presence: presenceVal,
        }),
      };
    })
    .sort((a, b) => {
      const order = { online: 0, recent: 1, offline: 2 };
      const p = order[a.presence] - order[b.presence];
      if (p !== 0) return p;
      const challengeOrder = {
        incoming_pending: 0,
        outgoing_pending: 1,
        active: 2,
        none: 3,
      };
      const c =
        challengeOrder[a.challengeState ?? 'none'] -
        challengeOrder[b.challengeState ?? 'none'];
      if (c !== 0) return c;
      return b.lastAt.getTime() - a.lastAt.getTime();
    })
    .map(({ lastAt: _lastAt, ...card }) => card);
}
