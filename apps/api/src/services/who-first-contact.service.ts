import { randomBytes, randomInt } from 'crypto';
import type { FriendCard } from '@98plus/shared';
import {
  buildBotStartUrl,
  buildStartParam,
  sanitizeFriendCard,
} from '@98plus/shared';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { broadcastToUser } from '../websocket/hub';
import { botUsername } from '../lib/deeplink';
import {
  listSocialGraph,
  recordSocialContact,
} from './social-graph.service';
import { normalizeUsername } from './invite.service';
import {
  normalizeUsersShared,
  type UsersSharedNorm,
} from './who-first-contact-parse';

export type { UsersSharedNorm };
export { normalizeUsersShared };
const RATE_LIMIT_PER_MINUTE = 20;
const RATE_WINDOW_SEC = 60;

export type WhoFirstContactWsPayload = {
  requestId: string;
  token: string;
  status: 'registered' | 'unregistered' | 'cancelled' | 'expired' | 'error';
  friend?: FriendCard | null;
  selectedTelegramId?: string | null;
  selectedFirstName?: string | null;
  selectedLastName?: string | null;
  selectedUsername?: string | null;
  errorMessage?: string | null;
};

export type WhoFirstContactBeginResult = {
  requestId: string;
  token: string;
  telegramRequestId: number;
  preparedId: string | null;
  botPickStartUrl: string;
  expiresAt: string;
  modeHint: 'prepared' | 'bot_keyboard';
};

const TTL_MS = 15 * 60 * 1000;

function makeToken(): string {
  return randomBytes(9).toString('base64url');
}

async function assertRateLimit(userId: string): Promise<void> {
  const key = `rate:friends:who-first-contact:${userId}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, RATE_WINDOW_SEC);
  if (count > RATE_LIMIT_PER_MINUTE) {
    const err = new Error('rate_limited');
    (err as Error & { code: string }).code = 'rate_limited';
    throw err;
  }
}

export async function savePreparedRequestUsersButton(params: {
  viewerTelegramId: number;
  telegramRequestId: number;
}): Promise<string> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not set');

  const res = await fetch(
    `https://api.telegram.org/bot${token}/savePreparedKeyboardButton`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: params.viewerTelegramId,
        button: {
          text: 'Выбрать человека',
          request_users: {
            request_id: params.telegramRequestId,
            user_is_bot: false,
            max_quantity: 1,
            request_name: true,
            request_username: true,
            request_photo: true,
          },
        },
      }),
    },
  );
  const data = (await res.json()) as {
    ok?: boolean;
    description?: string;
    result?: { id?: string };
  };
  if (!data.ok || !data.result?.id) {
    throw new Error(data.description ?? 'savePreparedKeyboardButton_failed');
  }
  return data.result.id;
}

async function friendCardForContact(
  ownerId: string,
  contactUserId: string,
  username: string,
): Promise<FriendCard | null> {
  const graph = await listSocialGraph(ownerId);
  const match =
    graph.find((c) => c.userId === contactUserId) ??
    graph.find(
      (c) => (c.username ?? '').toLowerCase() === username.toLowerCase(),
    );
  return match ? sanitizeFriendCard(match) : null;
}

export async function beginWhoFirstContact(params: {
  ownerUserId: string;
  ownerTelegramId: string;
}): Promise<WhoFirstContactBeginResult> {
  await assertRateLimit(params.ownerUserId);
  const ownerTelegramId = BigInt(params.ownerTelegramId);
  const telegramRequestId = randomInt(1, 2_147_483_647);
  const token = makeToken();
  const expiresAt = new Date(Date.now() + TTL_MS);

  await prisma.whoFirstContactRequest.updateMany({
    where: {
      ownerUserId: params.ownerUserId,
      status: 'pending',
      expiresAt: { lte: new Date() },
    },
    data: { status: 'expired', resolvedAt: new Date() },
  });

  await prisma.whoFirstContactRequest.updateMany({
    where: { ownerUserId: params.ownerUserId, status: 'pending' },
    data: { status: 'cancelled', resolvedAt: new Date() },
  });

  let preparedButtonId: string | null = null;
  let prepareError: string | null = null;
  try {
    preparedButtonId = await savePreparedRequestUsersButton({
      viewerTelegramId: Number(ownerTelegramId),
      telegramRequestId,
    });
  } catch (err) {
    prepareError = err instanceof Error ? err.message : String(err);
    console.warn('[who-first-contact] prepare failed; bot_keyboard fallback', {
      error: prepareError,
    });
  }

  const row = await prisma.whoFirstContactRequest.create({
    data: {
      token,
      ownerUserId: params.ownerUserId,
      ownerTelegramId,
      telegramRequestId,
      preparedButtonId,
      status: 'pending',
      expiresAt,
      errorMessage: prepareError,
    },
  });

  const botPickStartUrl = buildBotStartUrl(
    botUsername(),
    buildStartParam({ type: 'who_first_contact', token: `pick_${token}` }),
  );

  console.log('[who-first-contact] begin', {
    id: row.id,
    token,
    ownerUserId: params.ownerUserId,
    ownerTelegramId: ownerTelegramId.toString(),
    telegramRequestId,
    preparedButtonId,
  });

  return {
    requestId: row.id,
    token,
    telegramRequestId,
    preparedId: preparedButtonId,
    botPickStartUrl,
    expiresAt: expiresAt.toISOString(),
    modeHint: preparedButtonId ? 'prepared' : 'bot_keyboard',
  };
}

export async function cancelWhoFirstContact(
  ownerUserId: string,
  requestId: string,
): Promise<void> {
  await prisma.whoFirstContactRequest.updateMany({
    where: { id: requestId, ownerUserId, status: 'pending' },
    data: { status: 'cancelled', resolvedAt: new Date() },
  });
}

function emitWs(ownerUserId: string, payload: WhoFirstContactWsPayload) {
  broadcastToUser(ownerUserId, {
    type: 'who:first-contact',
    payload,
  });
}

export async function handleWhoFirstContactUsersShared(params: {
  messageFromId: number;
  usersShared: unknown;
}): Promise<void> {
  const normalized = normalizeUsersShared(params.usersShared);
  if (!normalized?.users[0]) {
    console.warn('[who-first-contact] users_shared empty/unparseable', params);
    return;
  }

  const selected = normalized.users[0];
  const selectedTelegramId = BigInt(String(selected.user_id));
  const hasPhotoMeta = Array.isArray(selected.photo)
    ? selected.photo.length > 0
    : selected.photo != null;

  console.log('[who-first-contact] users_shared', {
    messageFromId: params.messageFromId,
    request_id: normalized.request_id,
    selectedTelegramId: selectedTelegramId.toString(),
    username: selected.username,
  });

  const pending = await prisma.whoFirstContactRequest.findFirst({
    where: {
      ownerTelegramId: BigInt(params.messageFromId),
      telegramRequestId: normalized.request_id,
      status: 'pending',
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!pending) {
    console.warn('[who-first-contact] no pending request', {
      messageFromId: params.messageFromId,
      request_id: normalized.request_id,
    });
    return;
  }

  // One-time claim — duplicate / late users_shared ignored.
  const claimed = await prisma.whoFirstContactRequest.updateMany({
    where: { id: pending.id, status: 'pending' },
    data: { status: 'processing' },
  });
  if (claimed.count !== 1) {
    console.warn('[who-first-contact] duplicate users_shared ignored', {
      id: pending.id,
      request_id: normalized.request_id,
    });
    return;
  }

  // Replay / wrong owner already filtered by query; self-check next
  if (selectedTelegramId === pending.ownerTelegramId) {
    await prisma.whoFirstContactRequest.update({
      where: { id: pending.id },
      data: {
        status: 'error',
        errorMessage: 'self',
        selectedTelegramId,
        selectedFirstName: selected.first_name ?? null,
        selectedLastName: selected.last_name ?? null,
        selectedUsername: selected.username ?? null,
        hasPhotoMeta,
        resolvedAt: new Date(),
      },
    });
    emitWs(pending.ownerUserId, {
      requestId: pending.id,
      token: pending.token,
      status: 'error',
      errorMessage: 'self',
      selectedTelegramId: selectedTelegramId.toString(),
    });
    return;
  }

  const existing = await prisma.user.findUnique({
    where: { telegramId: selectedTelegramId },
    select: {
      id: true,
      username: true,
      firstName: true,
      photoUrl: true,
    },
  });

  if (!existing) {
    await prisma.whoFirstContactRequest.update({
      where: { id: pending.id },
      data: {
        status: 'unregistered',
        selectedTelegramId,
        selectedFirstName: selected.first_name ?? null,
        selectedLastName: selected.last_name ?? null,
        selectedUsername: selected.username ?? null,
        hasPhotoMeta,
        resolvedAt: new Date(),
      },
    });
    emitWs(pending.ownerUserId, {
      requestId: pending.id,
      token: pending.token,
      status: 'unregistered',
      selectedTelegramId: selectedTelegramId.toString(),
      selectedFirstName: selected.first_name ?? null,
      selectedLastName: selected.last_name ?? null,
      selectedUsername: selected.username ?? null,
    });
    void sendFirstContactReturnButton({
      telegramId: params.messageFromId,
      token: pending.token,
      registered: false,
    });
    return;
  }

  const contactUsername = existing.username
    ? normalizeUsername(existing.username)
    : selected.username
      ? normalizeUsername(selected.username)
      : `uid:${existing.id}`;

  await recordSocialContact(pending.ownerUserId, {
    username: contactUsername,
    contactUserId: existing.id,
    firstName: existing.firstName,
    photoUrl: existing.photoUrl,
    source: 'WHO_FIRST_CONTACT',
  });

  const friend = await friendCardForContact(
    pending.ownerUserId,
    existing.id,
    contactUsername,
  );

  await prisma.whoFirstContactRequest.update({
    where: { id: pending.id },
    data: {
      status: 'registered',
      selectedTelegramId,
      selectedFirstName: existing.firstName,
      selectedLastName: selected.last_name ?? null,
      selectedUsername: existing.username ?? selected.username ?? null,
      hasPhotoMeta,
      friendCardJson: friend ? (friend as object) : undefined,
      resolvedAt: new Date(),
    },
  });

  emitWs(pending.ownerUserId, {
    requestId: pending.id,
    token: pending.token,
    status: 'registered',
    friend,
    selectedTelegramId: selectedTelegramId.toString(),
    selectedFirstName: existing.firstName,
    selectedUsername: existing.username ?? selected.username ?? null,
  });

  void sendFirstContactReturnButton({
    telegramId: params.messageFromId,
    token: pending.token,
    registered: true,
  });

  console.log('[who-first-contact] registered', {
    id: pending.id,
    friendId: friend?.userId ?? existing.id,
  });
}

/**
 * Consume a resolved registered request (deeplink return / explicit client).
 * One-time: marks consumed. Returns FriendCard for WHAT entry.
 */
export async function consumeWhoFirstContact(params: {
  ownerUserId: string;
  token: string;
}): Promise<{
  status: string;
  friend: FriendCard | null;
  selectedTelegramId: string | null;
  selectedUsername: string | null;
}> {
  const token = params.token.replace(/^pick_/, '');
  const row = await prisma.whoFirstContactRequest.findFirst({
    where: { token, ownerUserId: params.ownerUserId },
  });
  if (!row) {
    return {
      status: 'not_found',
      friend: null,
      selectedTelegramId: null,
      selectedUsername: null,
    };
  }

  if (row.status === 'pending' && row.expiresAt.getTime() < Date.now()) {
    await prisma.whoFirstContactRequest.update({
      where: { id: row.id },
      data: { status: 'expired', resolvedAt: new Date() },
    });
    return {
      status: 'expired',
      friend: null,
      selectedTelegramId: null,
      selectedUsername: null,
    };
  }

  const resolveFriend = async (): Promise<FriendCard | null> =>
    (row.friendCardJson ? sanitizeFriendCard(row.friendCardJson) : null) ??
    (row.selectedTelegramId
      ? await (async () => {
          const u = await prisma.user.findUnique({
            where: { telegramId: row.selectedTelegramId! },
          });
          if (!u) return null;
          return friendCardForContact(
            params.ownerUserId,
            u.id,
            u.username ? normalizeUsername(u.username) : `uid:${u.id}`,
          );
        })()
      : null);

  if (row.status === 'registered') {
    const friend = await resolveFriend();
    await prisma.whoFirstContactRequest.update({
      where: { id: row.id },
      data: { consumedAt: new Date(), status: 'consumed' },
    });
    return {
      status: 'registered',
      friend,
      selectedTelegramId: row.selectedTelegramId?.toString() ?? null,
      selectedUsername: row.selectedUsername,
    };
  }

  // Short window after consume so "Открыть 98+" can still restore WHAT once.
  if (
    row.status === 'consumed' &&
    row.consumedAt &&
    Date.now() - row.consumedAt.getTime() < 120_000
  ) {
    return {
      status: 'registered',
      friend: await resolveFriend(),
      selectedTelegramId: row.selectedTelegramId?.toString() ?? null,
      selectedUsername: row.selectedUsername,
    };
  }

  if (row.status === 'unregistered') {
    if (!row.consumedAt) {
      await prisma.whoFirstContactRequest.update({
        where: { id: row.id },
        data: { consumedAt: new Date() },
      });
    }
    return {
      status: 'unregistered',
      friend: null,
      selectedTelegramId: row.selectedTelegramId?.toString() ?? null,
      selectedUsername: row.selectedUsername,
    };
  }

  return {
    status: row.status,
    friend: null,
    selectedTelegramId: row.selectedTelegramId?.toString() ?? null,
    selectedUsername: row.selectedUsername,
  };
}

export async function getWhoFirstContact(
  ownerUserId: string,
  requestId: string,
) {
  return prisma.whoFirstContactRequest.findFirst({
    where: { id: requestId, ownerUserId },
  });
}

/** Bot /start wfc_pick_<token> — send reply keyboard request_users. */
export async function sendBotKeyboardForFirstContact(params: {
  telegramId: number;
  tokenWithPickPrefix: string;
}): Promise<boolean> {
  const token = params.tokenWithPickPrefix.replace(/^pick_/, '');
  const row = await prisma.whoFirstContactRequest.findFirst({
    where: {
      token,
      ownerTelegramId: BigInt(params.telegramId),
      status: 'pending',
      expiresAt: { gt: new Date() },
    },
  });
  if (!row) return false;

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return false;

  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: params.telegramId,
      text: 'Выбери, кому запретишь:',
      reply_markup: {
        keyboard: [
          [
            {
              text: 'Выбрать человека',
              request_users: {
                request_id: row.telegramRequestId,
                user_is_bot: false,
                max_quantity: 1,
                request_name: true,
                request_username: true,
                request_photo: true,
              },
            },
          ],
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    }),
  });
  const data = (await res.json()) as { ok?: boolean };
  return !!data.ok;
}

export async function sendFirstContactReturnButton(params: {
  telegramId: number;
  token: string;
  registered: boolean;
}): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return;
  const { botWebAppButtonUrl } = await import('../lib/deeplink');
  const url = botWebAppButtonUrl(
    { type: 'who_first_contact', token: params.token },
    {
      source: 'whoFirstContactReturn',
      buttonLabel: 'Открыть 98+',
    },
  );
  const text = params.registered
    ? 'Готово. Открой 98+, чтобы продолжить запрет.'
    : 'Этот человек ещё не в 98+. Открой приложение, чтобы пригласить.';
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: params.telegramId,
      text,
      reply_markup: {
        inline_keyboard: [[{ text: 'Открыть 98+', web_app: { url } }]],
      },
    }),
  }).catch(() => {});
}
