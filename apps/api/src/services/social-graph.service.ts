import type { FriendCard } from '@98plus/shared';
import {
  AURA_LABELS,
  getAuraLevel,
  isSyntheticSocialUsername,
  resolveFriendState,
} from '@98plus/shared';
import { prisma } from '../lib/prisma';
import { pickStoredPhotoUrl } from '../lib/avatar-url';
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

  const existing = await prisma.socialContact.findUnique({
    where: {
      ownerId_contactUsername: { ownerId, contactUsername },
    },
    select: { contactPhotoUrl: true },
  });
  const contactPhotoUrl = pickStoredPhotoUrl(
    photoUrl,
    existing?.contactPhotoUrl,
  );

  await prisma.socialContact.upsert({
    where: {
      ownerId_contactUsername: { ownerId, contactUsername },
    },
    create: {
      ownerId,
      contactUserId,
      contactUsername,
      contactFirstName: firstName,
      contactPhotoUrl,
      lastChallengeText: snippet,
      interactionCount: 1,
      lastInteractionAt: new Date(),
      lastSource: data.source,
    },
    update: {
      ...(contactUserId ? { contactUserId } : {}),
      contactFirstName: firstName,
      contactPhotoUrl,
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
  const photoPatch = user.photoUrl
    ? { contactPhotoUrl: user.photoUrl }
    : {};

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
        ...photoPatch,
      },
    });
  }

  await prisma.socialContact.updateMany({
    where: { contactUserId: user.id },
    data: {
      contactFirstName: user.firstName,
      ...photoPatch,
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

/**
 * Backfill graph from historical bans/invites (idempotent upserts).
 * Expensive — do not call on GET /friends; run on login/background only.
 */
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

type RelationshipOverlay = {
  challengeState: FriendCard['challengeState'];
  hasPendingInvite: boolean;
  recentChallenge: string | null;
};

function challengeSnippet(text: string): string {
  return text.length > 42 ? `${text.slice(0, 42)}…` : text;
}

function overlayFromBan(
  ban: { senderId: string; receiverId: string; status: string; text: string },
  ownerId: string,
): RelationshipOverlay {
  let challengeState: FriendCard['challengeState'] = 'none';
  if (ban.status === 'PENDING') {
    challengeState =
      ban.receiverId === ownerId ? 'incoming_pending' : 'outgoing_pending';
  } else if (ban.status === 'ACTIVE' || ban.status === 'CHECKING') {
    challengeState = 'active';
  }
  return {
    challengeState,
    hasPendingInvite: false,
    recentChallenge: challengeSnippet(ban.text),
  };
}

/** Batch relationship state — 2 queries instead of N×2. */
async function getRelationshipOverlaysBatch(
  ownerId: string,
  contacts: { contactUserId: string | null; contactUsername: string }[],
): Promise<Map<string, RelationshipOverlay>> {
  const empty = (): RelationshipOverlay => ({
    challengeState: 'none',
    hasPendingInvite: false,
    recentChallenge: null,
  });

  const contactKey = (c: {
    contactUserId: string | null;
    contactUsername: string;
  }) => c.contactUserId ?? `u:${normalizeUsername(c.contactUsername)}`;

  const out = new Map<string, RelationshipOverlay>();
  for (const c of contacts) {
    out.set(contactKey(c), empty());
  }

  const linkedUserIds = [
    ...new Set(
      contacts
        .map((c) => c.contactUserId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];

  if (linkedUserIds.length > 0) {
    const bans = await prisma.ban.findMany({
      where: {
        OR: [
          { senderId: ownerId, receiverId: { in: linkedUserIds } },
          { senderId: { in: linkedUserIds }, receiverId: ownerId },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        senderId: true,
        receiverId: true,
        status: true,
        text: true,
      },
      take: 300,
    });

    const latestBanByOther = new Map<string, (typeof bans)[0]>();
    for (const b of bans) {
      const otherId = b.senderId === ownerId ? b.receiverId : b.senderId;
      if (!latestBanByOther.has(otherId)) {
        latestBanByOther.set(otherId, b);
      }
    }

    for (const c of contacts) {
      if (!c.contactUserId) continue;
      const ban = latestBanByOther.get(c.contactUserId);
      if (!ban) continue;
      out.set(contactKey(c), overlayFromBan(ban, ownerId));
    }
  }

  const usernameSet = new Set(
    contacts
      .map((c) => normalizeUsername(c.contactUsername))
      .filter((u) => u.length > 0 && !u.startsWith('uid:')),
  );

  if (usernameSet.size > 0) {
    const invites = await prisma.banInvite.findMany({
      where: { senderId: ownerId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      select: { targetUsername: true, text: true },
      take: 80,
    });

    const latestInviteByUsername = new Map<string, (typeof invites)[0]>();
    for (const inv of invites) {
      const key = normalizeUsername(inv.targetUsername);
      if (!usernameSet.has(key) || latestInviteByUsername.has(key)) continue;
      latestInviteByUsername.set(key, inv);
    }

    for (const c of contacts) {
      const u = normalizeUsername(c.contactUsername);
      const inv = latestInviteByUsername.get(u);
      if (!inv) continue;
      out.set(contactKey(c), {
        challengeState: 'outgoing_pending',
        hasPendingInvite: true,
        recentChallenge: challengeSnippet(inv.text),
      });
    }
  }

  return out;
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

export type FriendsListTimings = {
  log: (stage: string, ms: number, totalMs: number) => void;
};

export async function listSocialGraph(
  userId: string,
  timings?: FriendsListTimings,
): Promise<FriendCard[]> {
  const t0 = Date.now();
  let stageAt = t0;
  const stage = (name: string) => {
    const now = Date.now();
    timings?.log(name, now - stageAt, now - t0);
    stageAt = now;
  };

  await purgeSyntheticContacts(userId);
  stage('purge-synthetic');

  const contacts = await prisma.socialContact.findMany({
    where: { ownerId: userId },
    orderBy: { lastInteractionAt: 'desc' },
    take: 50,
    include: {
      contactUser: {
        select: {
          id: true,
          telegramId: true,
          username: true,
          firstName: true,
          photoUrl: true,
          energy: true,
          streak: true,
          lastSeenAt: true,
        },
      },
    },
  });
  stage('db-friends-query');

  const contactRows = contacts.filter(
    (c) => !isSyntheticSocialUsername(c.contactUsername),
  );

  const overlays = await getRelationshipOverlaysBatch(
    userId,
    contactRows.map((c) => ({
      contactUserId: c.contactUserId,
      contactUsername: c.contactUsername,
    })),
  );
  stage('relationship-overlay');

  const cards: (FriendCard & { lastAt: Date })[] = [];

  for (const c of contactRows) {
    const live = c.contactUser;
    const userIdLinked = live?.id ?? c.contactUserId;
    const overlayKey =
      userIdLinked ?? `u:${normalizeUsername(c.contactUsername)}`;
    const overlay = overlays.get(overlayKey) ?? {
      challengeState: 'none' as const,
      hasPendingInvite: false,
      recentChallenge: null,
    };

    const firstName = (live?.firstName ?? c.contactFirstName ?? '').trim();
    const photoUrl = pickStoredPhotoUrl(live?.photoUrl, c.contactPhotoUrl);
    const avatarUrl = photoUrl;
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
      avatarUrl,
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
  stage('users-mapping');

  const presence = await getPresenceBatch(
    cards.filter((f) => f.userId).map((f) => f.userId!),
  );
  stage('status-online');

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
