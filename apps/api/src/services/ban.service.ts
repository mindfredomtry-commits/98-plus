import { BanStatus, InteractionOutcome as PrismaOutcome } from '@prisma/client';
import type { User } from '@prisma/client';
import {
  SYSTEM_VOICE,
  formatChallengeShareMessage,
  isValidDurationMinutes,
  ANALYTICS_EVENTS,
  CHECK_TIMEOUT_MINUTES,
  REMINDER_BEFORE_MS,
  COOLDOWN_CHECK_SECONDS,
  INCOMING_PENDING_MAX_AGE_MS,
} from '@98plus/shared';
import type { BanInteraction, CheckState, BanResult } from '@98plus/shared';
import { prisma } from '../lib/prisma';
import { hasCooldown, setCooldown } from '../lib/redis';
import {
  applyOverboard,
  applySendEnergy,
  canSendBan,
  recordBanSent,
} from './energy.service';
import { mapUser } from './user-mapper';
import { broadcastEnergyPopup, broadcastToUser } from '../websocket/hub';
import {
  notifyRegisteredFriendBanAsync,
  sendRegisteredFriendBanNotification,
  sendCheckNotification,
  sendIncomingBanNotification,
  sendResultNotification,
  sendTimerReminderNotification,
} from '../bot/notifications';
import {
  shouldAttachNotificationDebug,
  type BanNotificationDebug,
} from '../lib/notification-debug';
import {
  buildBanResult,
  checkOutcomeToPrisma,
  mapBanRowToResult,
  overboardToPrisma,
} from './result.service';
import { applyCheckResult, resolveCheckOutcome } from './energy.service';
import { banParticipantRole, logResultLatency } from '../lib/result-latency-diag';
import { miniAppLink } from '../lib/deeplink';
import { trackEvent } from './analytics.service';
import { createPendingInvite, normalizeUsername } from './invite.service';
import { recordSocialContact } from './social-graph.service';
import { applySenderSendCostOnly } from './energy.service';
import {
  buildDevBanInteractionFallback,
  ensureDevFixturesForUser,
  isDevModeUser,
  resolveDevBanReceiver,
} from './dev-fixtures.service';

const COOLDOWN_SEND = 10;

function mapBanStatus(s: BanStatus): BanInteraction['status'] {
  const map: Record<BanStatus, BanInteraction['status']> = {
    PENDING: 'pending',
    ACTIVE: 'active',
    REPLIED: 'replied',
    COUNTERED: 'countered',
    OVERBOARD: 'overboard',
    CHECKING: 'checking',
    COMPLETED: 'completed',
    EXPIRED: 'expired',
    FAILED: 'failed',
  };
  return map[s];
}

function scheduleEnd(minutes: number): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}

type BanWithUsers = {
  id: string;
  text: string;
  status: BanStatus;
  durationMinutes: number;
  threadId: string;
  createdAt: Date;
  expiresAt: Date | null;
  checkDueAt: Date | null;
  receiverId: string;
  receiverIncomingAckAt: Date | null;
  sender: User;
  receiver: User;
};

function buildInteractionFromBan(
  ban: BanWithUsers,
  viewerId: string,
): BanInteraction {
  const target = ban.checkDueAt ?? ban.expiresAt;
  const remainingMs = target
    ? Math.max(0, target.getTime() - Date.now())
    : undefined;

  return {
    id: ban.id,
    text: ban.text,
    status: mapBanStatus(ban.status),
    durationMinutes: ban.durationMinutes as BanInteraction['durationMinutes'],
    sender: mapUser(ban.sender),
    receiver: mapUser(ban.receiver),
    isIncoming: ban.receiverId === viewerId,
    incomingAcknowledged:
      ban.receiverId === viewerId && ban.receiverIncomingAckAt != null,
    createdAt: ban.createdAt.toISOString(),
    expiresAt: ban.expiresAt?.toISOString() ?? null,
    checkDueAt: ban.checkDueAt?.toISOString() ?? null,
    threadId: ban.threadId,
    remainingMs:
      ban.status === 'ACTIVE' ||
      ban.status === 'CHECKING' ||
      ban.status === 'PENDING'
        ? remainingMs
        : undefined,
    serverNow: new Date().toISOString(),
  };
}

export async function mapBanToInteraction(
  banId: string,
  viewerId: string,
): Promise<BanInteraction | null> {
  const ban = await prisma.ban.findUnique({
    where: { id: banId },
    include: { sender: true, receiver: true },
  });
  if (!ban) return null;

  const target = ban.checkDueAt ?? ban.expiresAt;
  const remainingMs = target
    ? Math.max(0, target.getTime() - Date.now())
    : undefined;

  return {
    id: ban.id,
    text: ban.text,
    status: mapBanStatus(ban.status),
    durationMinutes: ban.durationMinutes as BanInteraction['durationMinutes'],
    sender: mapUser(ban.sender),
    receiver: mapUser(ban.receiver),
    isIncoming: ban.receiverId === viewerId,
    incomingAcknowledged:
      ban.receiverId === viewerId && ban.receiverIncomingAckAt != null,
    createdAt: ban.createdAt.toISOString(),
    expiresAt: ban.expiresAt?.toISOString() ?? null,
    checkDueAt: ban.checkDueAt?.toISOString() ?? null,
    threadId: ban.threadId,
    remainingMs:
      ban.status === 'ACTIVE' ||
      ban.status === 'CHECKING' ||
      ban.status === 'PENDING'
        ? remainingMs
        : undefined,
    serverNow: new Date().toISOString(),
  };
}

/** Sync WS emit — payloads must be pre-built (same path as ban:incoming). */
function emitCheckCompletedResults(
  banId: string,
  senderId: string,
  receiverId: string,
  resultSender: BanResult | null,
  resultReceiver: BanResult | null,
  t0: number,
) {
  if (resultSender) {
    logResultLatency('[result-emit-start]', {
      banId,
      role: 'sender',
      toUserId: senderId,
      elapsedMs: Date.now() - t0,
    });
    const delivery = broadcastToUser(senderId, {
      type: 'check:completed',
      payload: resultSender,
    });
    logResultLatency('[result-emit-done]', {
      banId,
      role: 'sender',
      toUserId: senderId,
      elapsedMs: Date.now() - t0,
      delivered: delivery.delivered,
      published: delivery.published,
    });
    logResultLatency('[result-emit-sender]', {
      banId,
      role: 'sender',
      toUserId: senderId,
      elapsedMs: Date.now() - t0,
      delivered: delivery.delivered,
      published: delivery.published,
    });
  }
  if (resultReceiver) {
    logResultLatency('[result-emit-start]', {
      banId,
      role: 'receiver',
      toUserId: receiverId,
      elapsedMs: Date.now() - t0,
    });
    const delivery = broadcastToUser(receiverId, {
      type: 'check:completed',
      payload: resultReceiver,
    });
    logResultLatency('[result-emit-done]', {
      banId,
      role: 'receiver',
      toUserId: receiverId,
      elapsedMs: Date.now() - t0,
      delivered: delivery.delivered,
      published: delivery.published,
    });
    logResultLatency('[result-emit-receiver]', {
      banId,
      role: 'receiver',
      toUserId: receiverId,
      elapsedMs: Date.now() - t0,
      delivered: delivery.delivered,
      published: delivery.published,
    });
  }
}

async function broadcastResultReady(
  banId: string,
  senderId: string,
  receiverId: string,
  opts?: {
    t0?: number;
    resultSender?: BanResult | null;
    resultReceiver?: BanResult | null;
  },
) {
  const t0 = opts?.t0 ?? Date.now();
  const [resultSender, resultReceiver] = await Promise.all([
    opts?.resultSender !== undefined
      ? Promise.resolve(opts.resultSender)
      : buildBanResult(banId, senderId),
    opts?.resultReceiver !== undefined
      ? Promise.resolve(opts.resultReceiver)
      : buildBanResult(banId, receiverId),
  ]);

  emitCheckCompletedResults(
    banId,
    senderId,
    receiverId,
    resultSender,
    resultReceiver,
    t0,
  );

  void (async () => {
    const ban = await prisma.ban.findUnique({
      where: { id: banId },
      include: { sender: true, receiver: true },
    });
    if (!ban || !resultSender) return;
    console.log('[result-created]', {
      banId,
      senderId,
      receiverId,
      outcome: ban.outcome ?? null,
      status: ban.status ?? null,
    });
    try {
      await sendResultNotification(
        ban.sender.telegramId,
        banId,
        resultSender.headline,
        ban.text,
      );
      await sendResultNotification(
        ban.receiver.telegramId,
        banId,
        resultReceiver?.headline ?? resultSender.headline,
        ban.text,
      );
    } catch (e) {
      console.warn('[result-notify-failed]', {
        banId,
        message: (e as Error).message,
      });
    }
  })();
}

function deferAfterCheckResult(
  ban: { id: string; senderId: string; receiverId: string },
  energy: { sender: number; receiver: number },
  msg: string,
) {
  setTimeout(() => {
    void (async () => {
      logResultLatency('[result-diag-defer-side-effects]', {
        banId: ban.id,
        delayMs: 250,
      });
      broadcastEnergyPopup(ban.senderId, energy.sender, msg);
      broadcastEnergyPopup(ban.receiverId, energy.receiver, msg);
      await syncSession(ban.senderId);
      await syncSession(ban.receiverId);
    })();
  }, 250);
}

async function syncSession(userId: string) {
  const { getSessionState } = await import('./session.service');
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const session = await getSessionState(userId, user?.username ?? null);
  broadcastToUser(userId, { type: 'sync:session', payload: session });
}

export async function getOrCreateThread(userA: string, userB: string) {
  const [a, b] = userA < userB ? [userA, userB] : [userB, userA];
  let thread = await prisma.banThread.findUnique({
    where: { userAId_userBId: { userAId: a, userBId: b } },
  });
  if (!thread) {
    thread = await prisma.banThread.create({ data: { userAId: a, userBId: b } });
  }
  return thread;
}

export async function findUserByTelegramId(telegramId: bigint) {
  return prisma.user.findUnique({ where: { telegramId } });
}

export async function findUserByUsername(username: string) {
  const clean = username.replace('@', '').toLowerCase();
  return prisma.user.findFirst({
    where: { username: { equals: clean, mode: 'insensitive' } },
  });
}

export async function sendBan(params: {
  senderId: string;
  receiverTelegramId?: bigint;
  receiverUserId?: string;
  receiverUsername?: string;
  text: string;
  durationMinutes: number;
}) {
  const { senderId, text, durationMinutes } = params;
  const devMode = await isDevModeUser(senderId);

  if (!isValidDurationMinutes(durationMinutes)) {
    throw new Error('Invalid duration');
  }

  if (devMode) {
    await ensureDevFixturesForUser(senderId);
  }

  const can = await canSendBan(senderId);
  if (!can.allowed) throw new Error(can.reason ?? 'Not allowed');

  if (
    !devMode &&
    (await hasCooldown(`cooldown:send:${senderId}`))
  ) {
    throw new Error('Подожди немного.');
  }

  let receiver = null;
  if (params.receiverUserId) {
    receiver = await prisma.user.findUnique({
      where: { id: params.receiverUserId },
    });
  } else if (params.receiverTelegramId) {
    receiver = await findUserByTelegramId(params.receiverTelegramId);
  } else if (params.receiverUsername) {
    receiver = await findUserByUsername(params.receiverUsername);
  }

  if (devMode) {
    receiver = await resolveDevBanReceiver(senderId, params, receiver);
  }

  if (!devMode && !receiver && params.receiverUsername) {
    const targetUsername = normalizeUsername(params.receiverUsername);
    const sender = await prisma.user.findUnique({ where: { id: senderId } });
    if (sender?.username && normalizeUsername(sender.username) === targetUsername) {
      throw new Error('Нельзя запретить себе.');
    }

    await setCooldown(`cooldown:send:${senderId}`, COOLDOWN_SEND);
    const energyDelta = await applySenderSendCostOnly(senderId);
    await recordBanSent(senderId);

    const { shareText, shareUrl } = await createPendingInvite({
      senderId,
      targetUsername,
      text,
      durationMinutes,
    });

    return {
      pending: true,
      requiresShare: true,
      energyDelta,
      shareText,
      shareUrl,
    };
  }

  if (!receiver) throw new Error('Укажи @username получателя.');

  if (receiver.id === senderId) {
    console.warn('[98+] /bans/send blocked: receiver equals sender', {
      senderId,
      receiverUserId: receiver.id,
      receiverUsername: receiver.username,
      receiverTelegramId: receiver.telegramId.toString(),
    });
    throw new Error('Нельзя запретить себе.');
  }

  const thread = await getOrCreateThread(senderId, receiver.id);

  const ban = await prisma.ban.create({
    data: {
      threadId: thread.id,
      senderId,
      receiverId: receiver.id,
      text: text.trim(),
      durationMinutes,
      status: 'PENDING',
      expiresAt: null,
      checkDueAt: null,
    },
    include: { sender: true, receiver: true },
  });

  console.log('[incoming-create]', {
    banId: ban.id,
    senderId,
    receiverId: receiver.id,
    status: ban.status,
  });

  const interaction = buildInteractionFromBan(ban, receiver.id);

  console.log('[incoming-ws-emit-start]', {
    banId: ban.id,
    toUserId: receiver.id,
    eventName: 'ban:incoming',
  });
  const emitResult = broadcastToUser(receiver.id, {
    type: 'ban:incoming',
    payload: interaction,
  });
  console.log('[incoming-ws-emit-done]', {
    banId: ban.id,
    deliveredOrQueued:
      emitResult.delivered > 0 ? `delivered:${emitResult.delivered}` : 'not-connected',
    published: emitResult.published,
  });

  await setCooldown(`cooldown:send:${senderId}`, COOLDOWN_SEND);
  const energy = await applySendEnergy(senderId, receiver.id);
  await recordBanSent(senderId);
  await trackEvent(ANALYTICS_EVENTS.BAN_SENT, senderId, {
    banId: ban.id,
    durationMinutes,
  });

  if (devMode && !interaction.sender?.id) {
    const fallback =
      (await mapBanToInteraction(ban.id, receiver.id)) ??
      buildDevBanInteractionFallback(ban, receiver.id);
    if (fallback) {
      Object.assign(interaction, fallback);
    }
  }

  await recordSocialContact(senderId, {
    username: receiver.username ?? receiver.firstName,
    contactUserId: receiver.id,
    firstName: receiver.firstName,
    photoUrl: receiver.photoUrl,
    recentChallenge: text.trim(),
    source: 'CHALLENGE_SENT',
  });
  await recordSocialContact(receiver.id, {
    username: ban.sender.username ?? ban.sender.firstName,
    contactUserId: senderId,
    firstName: ban.sender.firstName,
    photoUrl: ban.sender.photoUrl,
    recentChallenge: text.trim(),
    source: 'CHALLENGE_RECEIVED',
  });

  const notifyParams = {
    banId: ban.id,
    senderUserId: senderId,
    receiverUserId: receiver.id,
    receiverTelegramId: receiver.telegramId,
    receiverUsername: receiver.username,
    banText: text.trim(),
    durationMinutes,
    isDevMode: devMode,
  };

  let notificationDebug: BanNotificationDebug | undefined;
  if (shouldAttachNotificationDebug()) {
    notificationDebug =
      await sendRegisteredFriendBanNotification(notifyParams);
  } else {
    notifyRegisteredFriendBanAsync(notifyParams);
  }

  void syncSession(receiver.id).catch((e) => {
    console.warn('[98+] syncSession receiver failed', (e as Error).message);
  });
  void syncSession(senderId).catch((e) => {
    console.warn('[98+] syncSession sender failed', (e as Error).message);
  });

  return {
    ban: interaction,
    energyDelta: energy.sender ?? 0,
    pending: false,
    requiresShare: false,
    ...(notificationDebug ? { notificationDebug } : {}),
  };
}

export async function rejectBan(banId: string, userId: string) {
  const ban = await prisma.ban.findUnique({ where: { id: banId } });
  if (!ban) throw new Error('Ban not found');
  if (ban.receiverId !== userId) throw new Error('Not your ban');
  if (ban.status !== 'PENDING') {
    return mapBanToInteraction(banId, userId);
  }

  await prisma.ban.update({
    where: { id: banId },
    data: { status: 'EXPIRED', handledAt: new Date() },
  });

  await trackEvent(ANALYTICS_EVENTS.BAN_REJECTED, userId, { banId });

  const senderView = await mapBanToInteraction(banId, ban.senderId);
  if (senderView) {
    broadcastToUser(ban.senderId, {
      type: 'ban:updated',
      payload: senderView,
    });
  }

  await syncSession(userId);
  await syncSession(ban.senderId);

  return null;
}

export async function acceptBan(banId: string, userId: string) {
  const ban = await prisma.ban.findUnique({ where: { id: banId } });
  if (!ban) throw new Error('Ban not found');
  if (ban.receiverId !== userId) throw new Error('Not your ban');
  if (ban.status !== 'PENDING') {
    return mapBanToInteraction(banId, userId);
  }

  const fromStatus = ban.status;
  const expiresAt = scheduleEnd(ban.durationMinutes);

  await prisma.ban.update({
    where: { id: banId },
    data: {
      status: 'ACTIVE',
      acceptedAt: new Date(),
      handledAt: new Date(),
      expiresAt,
      checkDueAt: expiresAt,
    },
  });

  console.log('[ban-status-change]', {
    banId,
    from: fromStatus,
    to: 'ACTIVE',
    reason: 'accept-ban',
    actorUserId: userId,
  });
  console.log('[accept-ban]', {
    banId,
    actorUserId: userId,
    receiverId: ban.receiverId,
    reason: 'explicit-accept',
  });

  const activated = await prisma.ban.findUnique({ where: { id: banId } });
  console.log('[ban-activate]', {
    banId,
    status: activated?.status ?? null,
    expiresAt: activated?.expiresAt?.toISOString() ?? null,
    checkDueAt: activated?.checkDueAt?.toISOString() ?? null,
    now: new Date().toISOString(),
  });

  await trackEvent(ANALYTICS_EVENTS.BAN_ACCEPTED, userId, { banId });

  if (activated?.checkDueAt) {
    const { scheduleCheckDueTimer } = await import('./check-due-timer');
    scheduleCheckDueTimer(banId, activated.checkDueAt);
  }

  const interaction = await mapBanToInteraction(banId, userId);
  broadcastToUser(ban.senderId, { type: 'ban:updated', payload: interaction });
  broadcastToUser(ban.receiverId, { type: 'ban:updated', payload: interaction });
  await syncSession(ban.senderId);
  await syncSession(ban.receiverId);

  return interaction;
}

/** Reply to incoming challenge: resolve parent + send reverse ban atomically */
export async function replyToIncomingBan(params: {
  banId: string;
  userId: string;
  text: string;
  durationMinutes: number;
}) {
  const parent = await prisma.ban.findUnique({
    where: { id: params.banId },
    include: { sender: true, receiver: true },
  });
  if (!parent) throw new Error('Ban not found');
  if (parent.receiverId !== params.userId) throw new Error('Not your ban');
  if (parent.status !== 'PENDING' && parent.status !== 'ACTIVE') {
    throw new Error('Already handled');
  }

  if (!isValidDurationMinutes(params.durationMinutes)) {
    throw new Error('Invalid duration');
  }

  const can = await canSendBan(params.userId);
  if (!can.allowed) throw new Error(can.reason ?? 'Not allowed');

  if (parent.status === 'PENDING') {
    await acceptBan(parent.id, params.userId);
  }

  if (!parent.receiverIncomingAckAt) {
    await prisma.ban.update({
      where: { id: parent.id },
      data: { receiverIncomingAckAt: new Date() },
    });
  }

  const thread = await getOrCreateThread(params.userId, parent.senderId);

  const reply = await prisma.ban.create({
    data: {
      threadId: thread.id,
      senderId: params.userId,
      receiverId: parent.senderId,
      text: params.text.trim(),
      durationMinutes: params.durationMinutes,
      status: 'PENDING',
      parentBanId: parent.id,
      expiresAt: null,
      checkDueAt: null,
    },
    include: { sender: true, receiver: true },
  });

  await setCooldown(`cooldown:send:${params.userId}`, COOLDOWN_SEND);
  await applySendEnergy(params.userId, parent.senderId);
  await recordBanSent(params.userId);
  await trackEvent(ANALYTICS_EVENTS.BAN_SENT, params.userId, {
    banId: reply.id,
    parentId: parent.id,
    durationMinutes: params.durationMinutes,
  });

  await recordSocialContact(params.userId, {
    username: parent.sender.username ?? parent.sender.firstName,
    contactUserId: parent.senderId,
    firstName: parent.sender.firstName,
    photoUrl: parent.sender.photoUrl,
    recentChallenge: params.text.trim(),
    source: 'CHALLENGE_SENT',
  });
  await recordSocialContact(parent.senderId, {
    username: parent.receiver.username ?? parent.receiver.firstName,
    contactUserId: params.userId,
    firstName: parent.receiver.firstName,
    photoUrl: parent.receiver.photoUrl,
    recentChallenge: params.text.trim(),
    source: 'CHALLENGE_RECEIVED',
  });

  const senderIncoming = (await mapBanToInteraction(reply.id, parent.senderId))!;
  broadcastToUser(parent.senderId, {
    type: 'ban:incoming',
    payload: senderIncoming,
  });

  const senderUsername =
    parent.receiver.username ?? parent.receiver.firstName;
  await sendIncomingBanNotification(
    parent.sender.telegramId,
    params.text,
    reply.id,
    false,
    senderUsername,
    params.durationMinutes,
    parent.receiver.firstName,
    parent.receiver.photoUrl,
  );

  await syncSession(parent.senderId);
  await syncSession(params.userId);

  const { getSessionState } = await import('./session.service');
  const session = await getSessionState(
    params.userId,
    parent.receiver.username,
  );

  return {
    parentId: parent.id,
    replyBan: await mapBanToInteraction(reply.id, params.userId),
    session,
  };
}

export async function counterBan(params: {
  banId: string;
  userId: string;
  text: string;
  durationMinutes: number;
}) {
  const parent = await prisma.ban.findUnique({
    where: { id: params.banId },
    include: { sender: true, receiver: true },
  });
  if (!parent) throw new Error('Ban not found');
  if (parent.receiverId !== params.userId) throw new Error('Not your ban');
  if (!['PENDING', 'ACTIVE'].includes(parent.status)) {
    throw new Error('Already handled');
  }

  if (!isValidDurationMinutes(params.durationMinutes)) {
    throw new Error('Invalid duration');
  }

  if (parent.status === 'PENDING') {
    await acceptBan(parent.id, params.userId);
  }

  const expiresAt = scheduleEnd(params.durationMinutes);

  await prisma.ban.update({
    where: { id: parent.id },
    data: { status: 'COUNTERED' },
  });

  const counter = await prisma.ban.create({
    data: {
      threadId: parent.threadId,
      senderId: params.userId,
      receiverId: parent.senderId,
      text: params.text.trim(),
      durationMinutes: params.durationMinutes,
      status: 'ACTIVE',
      parentBanId: parent.id,
      acceptedAt: new Date(),
      expiresAt,
      checkDueAt: expiresAt,
    },
  });

  const { scheduleCheckDueTimer } = await import('./check-due-timer');
  scheduleCheckDueTimer(counter.id, expiresAt);

  await trackEvent(ANALYTICS_EVENTS.BAN_COUNTER, params.userId, {
    banId: counter.id,
    parentId: parent.id,
  });

  const senderView = await mapBanToInteraction(counter.id, parent.senderId);
  const receiverView = await mapBanToInteraction(counter.id, params.userId);
  if (!senderView || !receiverView) {
    throw new Error('Failed to load counter challenge');
  }

  await recordSocialContact(params.userId, {
    username: parent.sender.username ?? parent.sender.firstName,
    contactUserId: parent.senderId,
    firstName: parent.sender.firstName,
    photoUrl: parent.sender.photoUrl,
    recentChallenge: params.text.trim(),
    source: 'CHALLENGE_SENT',
  });
  await recordSocialContact(parent.senderId, {
    username: parent.receiver.username ?? parent.receiver.firstName,
    contactUserId: params.userId,
    firstName: parent.receiver.firstName,
    photoUrl: parent.receiver.photoUrl,
    recentChallenge: params.text.trim(),
    source: 'CHALLENGE_RECEIVED',
  });

  broadcastToUser(parent.senderId, {
    type: 'ban:incoming',
    payload: senderView,
  });
  broadcastToUser(params.userId, {
    type: 'ban:updated',
    payload: receiverView,
  });

  try {
    await sendIncomingBanNotification(
      parent.sender.telegramId,
      params.text,
      counter.id,
      false,
      parent.receiver.username ?? parent.receiver.firstName,
      params.durationMinutes,
      parent.receiver.firstName,
      parent.receiver.photoUrl,
    );
  } catch {
    /* bot optional */
  }

  await syncSession(parent.senderId);
  await syncSession(params.userId);

  return receiverView;
}

export async function markOverboard(banId: string, userId: string) {
  const ban = await prisma.ban.findUnique({ where: { id: banId } });
  if (!ban) throw new Error('Ban not found');
  if (ban.receiverId !== userId) throw new Error('Not your ban');
  if (!['PENDING', 'ACTIVE'].includes(ban.status)) {
    throw new Error('Already handled');
  }

  if (await hasCooldown(`cooldown:overboard:${userId}`)) {
    throw new Error('Подожди.');
  }
  await setCooldown(`cooldown:overboard:${userId}`, 120);

  const energy = await applyOverboard(ban.senderId, ban.receiverId);

  await prisma.ban.update({
    where: { id: banId },
    data: {
      status: 'OVERBOARD',
      isOverboard: true,
      outcome: overboardToPrisma(),
      completedAt: new Date(),
      senderEnergyDelta: energy.sender,
      receiverEnergyDelta: energy.receiver,
      energyApplied: true,
      receiverIncomingAckAt: new Date(),
      senderResultSeenAt: null,
      receiverResultSeenAt: null,
    },
  });

  await trackEvent(ANALYTICS_EVENTS.BAN_OVERBOARD, userId, { banId });

  broadcastEnergyPopup(ban.senderId, energy.sender, SYSTEM_VOICE.overboard);
  broadcastEnergyPopup(ban.receiverId, energy.receiver, SYSTEM_VOICE.overboard);
  await broadcastResultReady(banId, ban.senderId, ban.receiverId);

  const updated = await mapBanToInteraction(banId, userId);
  await syncSession(ban.senderId);
  await syncSession(ban.receiverId);
  return updated;
}

export async function submitCheckAnswer(
  banId: string,
  userId: string,
  completed: boolean,
) {
  if (await hasCooldown(`cooldown:check:${banId}:${userId}`)) {
    const existing = await buildBanResult(banId, userId);
    if (existing) {
      return { done: true, outcome: existing.outcome, result: existing, waiting: false };
    }
  }
  await setCooldown(`cooldown:check:${banId}:${userId}`, COOLDOWN_CHECK_SECONDS);

  const ban = await prisma.ban.findUnique({
    where: { id: banId },
    include: { checkAnswers: true, sender: true, receiver: true },
  });
  if (!ban) throw new Error('Ban not found');

  if (['COMPLETED', 'OVERBOARD', 'FAILED', 'EXPIRED'].includes(ban.status)) {
    const result = await buildBanResult(banId, userId);
    return { done: true, outcome: result?.outcome ?? null, result, waiting: false };
  }

  if (ban.status !== 'CHECKING') {
    throw new Error('Проверка ещё не началась');
  }

  const existing = ban.checkAnswers.find((a) => a.userId === userId);
  if (existing) {
    const result = await buildBanResult(banId, userId);
    if (result) return { done: true, outcome: result.outcome, result, waiting: false };
  }

  const t0 = Date.now();
  const actorRole = banParticipantRole(userId, ban.senderId, ban.receiverId);
  logResultLatency('[result-click-answer]', {
    banId,
    userId,
    role: actorRole,
    t0,
  });

  await prisma.banCheckAnswer.upsert({
    where: { banId_userId: { banId, userId } },
    create: { banId, userId, completed },
    update: { completed },
  });
  logResultLatency('[result-answer-saved]', {
    banId,
    userId,
    role: actorRole,
    elapsedMs: Date.now() - t0,
  });

  const answers = await prisma.banCheckAnswer.findMany({ where: { banId } });

  if (answers.length < 2) {
    logResultLatency('[result-first-answer-waiting]', {
      banId,
      userId,
      role: actorRole,
      answerCount: answers.length,
      elapsedMs: Date.now() - t0,
    });
    void trackEvent(ANALYTICS_EVENTS.CHECK_ANSWERED, userId, {
      banId,
      completed,
    });
    const waitingPayload = await getCheckState(banId, userId);
    broadcastToUser(ban.senderId, { type: 'check:waiting', payload: waitingPayload });
    broadcastToUser(ban.receiverId, { type: 'check:waiting', payload: waitingPayload });
    return {
      done: false,
      outcome: null,
      waiting: true,
      checkState: waitingPayload,
    };
  }

  const senderAns = answers.find((a) => a.userId === ban.senderId)!;
  const receiverAns = answers.find((a) => a.userId === ban.receiverId)!;

  logResultLatency('[result-second-answer]', {
    banId,
    userId,
    role: actorRole,
    elapsedMs: Date.now() - t0,
  });
  logResultLatency('[result-both-answered]', {
    banId,
    secondAnswererId: userId,
    secondAnswererRole: actorRole,
    elapsedMs: Date.now() - t0,
  });

  void trackEvent(ANALYTICS_EVENTS.CHECK_ANSWERED, userId, {
    banId,
    completed,
  });

  const outcome = resolveCheckOutcome(senderAns.completed, receiverAns.completed);

  logResultLatency('[result-apply-start]', {
    banId,
    role: actorRole,
    elapsedMs: Date.now() - t0,
  });
  const energy = await applyCheckResult(banId, outcome, {
    id: ban.id,
    senderId: ban.senderId,
    receiverId: ban.receiverId,
    energyApplied: ban.energyApplied,
    senderEnergyDelta: ban.senderEnergyDelta,
    receiverEnergyDelta: ban.receiverEnergyDelta,
    farmSkipped: ban.farmSkipped,
  });
  logResultLatency('[result-apply-done]', {
    banId,
    role: actorRole,
    elapsedMs: Date.now() - t0,
  });

  logResultLatency('[result-build-start]', {
    banId,
    role: actorRole,
    elapsedMs: Date.now() - t0,
  });
  const resultSender = mapBanRowToResult(energy.completedBan, ban.senderId);
  const resultReceiver = mapBanRowToResult(energy.completedBan, ban.receiverId);
  console.log('[result-build-done]', {
    banId,
    elapsedMs: Date.now() - t0,
    hasSenderPayload: !!resultSender,
    hasReceiverPayload: !!resultReceiver,
  });

  emitCheckCompletedResults(
    banId,
    ban.senderId,
    ban.receiverId,
    resultSender,
    resultReceiver,
    t0,
  );

  const result =
    userId === ban.senderId
      ? resultSender
      : userId === ban.receiverId
        ? resultReceiver
        : mapBanRowToResult(energy.completedBan, userId);

  const msg =
    outcome === 'split' ? SYSTEM_VOICE.socialUnstable : SYSTEM_VOICE.checkComplete;
  deferAfterCheckResult(ban, energy, msg);

  logResultLatency('[result-http-return]', {
    banId,
    userId,
    role: actorRole,
    elapsedMs: Date.now() - t0,
    hasResult: !!result,
  });
  logResultLatency('[result-http-response]', {
    banId,
    userId,
    role: actorRole,
    elapsedMs: Date.now() - t0,
    hasResult: !!result,
  });

  return {
    done: true,
    outcome,
    energy,
    result,
    waiting: false,
    farmSkipped: energy.farmSkipped,
  };
}

export async function getCheckState(
  banId: string,
  userId: string,
): Promise<CheckState> {
  const answers = await prisma.banCheckAnswer.findMany({ where: { banId } });
  const mine = answers.find((a) => a.userId === userId);
  const ban = await prisma.ban.findUnique({ where: { id: banId } });
  const partnerId = ban?.senderId === userId ? ban.receiverId : ban?.senderId;
  const partner = answers.find((a) => a.userId === partnerId);

  return {
    banId,
    answered: !!mine,
    myAnswer: mine?.completed ?? null,
    waitingForPartner: !!mine && !partner,
    partnerAnswered: !!partner,
  };
}

export async function getBanResult(banId: string, viewerId: string) {
  return buildBanResult(banId, viewerId);
}

/** Read-only ban view for verify/deep-link — never activates PENDING bans. */
export async function resolveDeepLinkBan(banId: string, userId: string) {
  const ban = await prisma.ban.findUnique({ where: { id: banId } });
  if (!ban) return null;
  const isParticipant =
    ban.senderId === userId || ban.receiverId === userId;
  if (!isParticipant) return null;
  return mapBanToInteraction(banId, userId);
}

export async function getActiveInteractions(userId: string, limit = 15) {
  const bans = await prisma.ban.findMany({
    where: {
      OR: [{ senderId: userId }, { receiverId: userId }],
      status: { in: ['PENDING', 'ACTIVE', 'CHECKING'] },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { sender: true, receiver: true },
  });

  const result: BanInteraction[] = [];
  for (const b of bans) {
    const m = await mapBanToInteraction(b.id, userId);
    if (m) result.push(m);
  }
  return result;
}

async function markIncomingAcked(banId: string): Promise<void> {
  await prisma.ban.update({
    where: { id: banId },
    data: { receiverIncomingAckAt: new Date() },
  });
}

/**
 * Backfill ack only for stale / already-handled pending incoming.
 * Never touches fresh (<24h) bans unless banId is in clientAckedBanIds.
 */
export async function backfillStaleIncomingForUser(
  userId: string,
  clientAckedBanIds: string[] = [],
): Promise<number> {
  const cutoff = new Date(Date.now() - INCOMING_PENDING_MAX_AGE_MS);
  let total = 0;

  const staleByAge = await prisma.ban.updateMany({
    where: {
      receiverId: userId,
      status: 'PENDING',
      receiverIncomingAckAt: null,
      createdAt: { lt: cutoff },
    },
    data: { receiverIncomingAckAt: new Date() },
  });
  total += staleByAge.count;

  const withReplyAck = await prisma.ban.updateMany({
    where: {
      receiverId: userId,
      status: 'PENDING',
      receiverIncomingAckAt: null,
      counterBans: { some: {} },
    },
    data: { receiverIncomingAckAt: new Date() },
  });
  total += withReplyAck.count;

  const handledPending = await prisma.ban.updateMany({
    where: {
      receiverId: userId,
      status: 'PENDING',
      receiverIncomingAckAt: null,
      handledAt: { not: null },
    },
    data: { receiverIncomingAckAt: new Date() },
  });
  total += handledPending.count;

  const uniqueIds = [
    ...new Set(
      clientAckedBanIds.filter((id) => typeof id === 'string' && id.length > 0),
    ),
  ];
  if (uniqueIds.length > 0) {
    const fromClient = await prisma.ban.updateMany({
      where: {
        id: { in: uniqueIds },
        receiverId: userId,
        receiverIncomingAckAt: null,
      },
      data: { receiverIncomingAckAt: new Date() },
    });
    total += fromClient.count;
  }

  // Collapse queue: ack older pending tails when a newer one exists (skip if <5min apart).
  const unacked = await prisma.ban.findMany({
    where: {
      receiverId: userId,
      status: 'PENDING',
      receiverIncomingAckAt: null,
      isOverboard: false,
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, createdAt: true },
  });
  if (unacked.length > 1) {
    const newest = unacked[0]!;
    const staleQueueIds = unacked.slice(1).filter((b) => {
      if (b.createdAt < cutoff) return true;
      const gapMs = newest.createdAt.getTime() - b.createdAt.getTime();
      return gapMs > 5 * 60 * 1000;
    }).map((b) => b.id);
    if (staleQueueIds.length > 0) {
      const queueAck = await prisma.ban.updateMany({
        where: {
          receiverId: userId,
          status: 'PENDING',
          receiverIncomingAckAt: null,
          id: { in: staleQueueIds },
        },
        data: { receiverIncomingAckAt: new Date() },
      });
      total += queueAck.count;
    }
  }

  if (total > 0) {
    console.log('[incoming-api]', {
      userId,
      reason: 'backfill-ack',
      count: total,
    });
  }

  return total;
}

function incomingSessionLog(
  payload: Record<string, unknown> & { userId: string; reason: string },
) {
  console.log('[incoming-session]', {
    userId: payload.userId,
    incomingId: payload.pendingIncomingId ?? null,
    reason: payload.reason,
  });
}

/** Diagnostic: why a pending row is not offered (null = offer). */
function pendingIncomingRejectReason(
  ban: {
    id: string;
    receiverId: string;
    status: string;
    receiverIncomingAckAt: Date | null;
    isOverboard: boolean;
    createdAt: Date;
    handledAt: Date | null;
    _count: { counterBans: number };
  },
  userId: string,
  cutoff: Date,
): string | null {
  if (ban.receiverId !== userId) return 'receiver mismatch';
  if (ban.status !== 'PENDING') return 'status mismatch';
  if (ban.receiverIncomingAckAt) return 'all acked';
  if (ban.isOverboard) return 'is overboard';
  if (ban.createdAt < cutoff) return 'too old';
  if (ban._count.counterBans > 0) return 'has counterBan';
  if (ban.handledAt) return 'handledAt set';
  return null;
}

/** Fresh offerable pending incoming — read-only, no auto-ack side effects. */
async function findFreshPendingIncomingRow(userId: string) {
  const cutoff = new Date(Date.now() - INCOMING_PENDING_MAX_AGE_MS);

  const ban = await prisma.ban.findFirst({
    where: {
      receiverId: userId,
      status: 'PENDING',
      receiverIncomingAckAt: null,
      isOverboard: false,
      handledAt: null,
      createdAt: { gte: cutoff },
      counterBans: { none: {} },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { counterBans: true } },
    },
  });

  if (!ban) {
    return { ban: null as null, reject: 'no pending bans' as const, cutoff };
  }

  const reject = pendingIncomingRejectReason(ban, userId, cutoff);
  return { ban, reject, cutoff };
}

export async function getPendingIncoming(userId: string) {
  const { ban, reject } = await findFreshPendingIncomingRow(userId);

  if (!ban) {
    incomingSessionLog({ userId, reason: reject ?? 'no pending bans' });
    return null;
  }

  const base = {
    userId,
    pendingIncomingId: ban.id,
    receiverId: ban.receiverId,
    status: ban.status,
    receiverIncomingAckAt: ban.receiverIncomingAckAt,
    createdAt: ban.createdAt,
    isOverboard: ban.isOverboard,
    handledAt: ban.handledAt,
    counterBansCount: ban._count.counterBans,
  };

  if (reject) {
    incomingSessionLog({ ...base, reason: reject });
    return null;
  }

  incomingSessionLog({ ...base, reason: 'selected' });
  return mapBanToInteraction(ban.id, userId);
}

/** Lightweight poll read — same rules as session incoming, poll-specific logs only. */
export async function getPendingIncomingForPoll(userId: string) {
  const { ban, reject } = await findFreshPendingIncomingRow(userId);

  console.log('[incoming-pending]', {
    userId,
    incomingId: ban?.id ?? null,
    reason: reject ?? (ban ? 'found' : 'none'),
  });

  if (!ban || reject) return null;
  return mapBanToInteraction(ban.id, userId);
}

/** Receiver dismissed incoming UI — does not activate ban (status stays PENDING). */
export async function acknowledgeIncomingBan(
  banId: string,
  userId: string,
): Promise<BanInteraction | null> {
  const ban = await prisma.ban.findUnique({ where: { id: banId } });
  if (!ban) return null;
  if (ban.receiverId !== userId) return null;

  console.log('[incoming-ack]', {
    banId,
    actorUserId: userId,
    receiverId: ban.receiverId,
    status: ban.status,
  });

  const fresh = await prisma.ban.findUnique({ where: { id: banId } });
  if (fresh && !fresh.receiverIncomingAckAt) {
    await prisma.ban.update({
      where: { id: banId },
      data: { receiverIncomingAckAt: new Date() },
    });
  }
  return mapBanToInteraction(banId, userId);
}

export async function getPendingCheck(userId: string) {
  const bans = await prisma.ban.findMany({
    where: {
      OR: [{ senderId: userId }, { receiverId: userId }],
      status: 'CHECKING',
    },
    orderBy: { checkDueAt: 'asc' },
    include: { checkAnswers: true },
  });

  for (const ban of bans) {
    if (!ban.checkAnswers.some((a) => a.userId === userId)) {
      return mapBanToInteraction(ban.id, userId);
    }
  }
  return null;
}

/** Lightweight poll read for due check overlay — no session side effects. */
export async function getPendingCheckForPoll(userId: string) {
  const ban = await getPendingCheck(userId);
  console.log('[check-pending]', {
    userId,
    checkBanId: ban?.id ?? null,
    reason: ban ? 'found' : 'none',
  });
  return ban;
}

export async function getWaitingCheck(userId: string) {
  const bans = await prisma.ban.findMany({
    where: {
      OR: [{ senderId: userId }, { receiverId: userId }],
      status: 'CHECKING',
    },
    include: { checkAnswers: true },
  });

  for (const ban of bans) {
    const mine = ban.checkAnswers.find((a) => a.userId === userId);
    const partnerId = ban.senderId === userId ? ban.receiverId : ban.senderId;
    const partner = ban.checkAnswers.find((a) => a.userId === partnerId);
    if (mine && !partner) {
      const mapped = await mapBanToInteraction(ban.id, userId);
      if (!mapped) continue;
      return {
        ban: mapped,
        checkState: await getCheckState(ban.id, userId),
      };
    }
  }
  return null;
}

/** Latest participant-visible completed result for sender or receiver. */
export async function getLatestPendingResultId(userId: string) {
  const ban = await prisma.ban.findFirst({
    where: {
      OR: [
        { senderId: userId, senderResultSeenAt: null },
        { receiverId: userId, receiverResultSeenAt: null },
      ],
      status: { in: ['COMPLETED', 'OVERBOARD', 'FAILED', 'EXPIRED'] },
      outcome: { not: null },
      completedAt: { not: null },
    },
    orderBy: { completedAt: 'desc' },
  });
  return ban?.id ?? null;
}

/** Lightweight poll read for result delivery fallback. */
export async function getPendingResultForPoll(userId: string) {
  const pendingId = await getLatestPendingResultId(userId);
  if (!pendingId) {
    console.log('[result-pending]', {
      userId,
      banId: null,
      role: null,
      seenAt: null,
      returned: false,
      reason: 'none',
    });
    return null;
  }

  const ban = await prisma.ban.findUnique({
    where: { id: pendingId },
    select: {
      id: true,
      senderId: true,
      receiverId: true,
      senderResultSeenAt: true,
      receiverResultSeenAt: true,
    },
  });
  if (!ban) {
    console.log('[result-pending]', {
      userId,
      banId: pendingId,
      role: null,
      seenAt: null,
      returned: false,
      reason: 'ban-not-found',
    });
    return null;
  }
  const role =
    ban.senderId === userId
      ? 'sender'
      : ban.receiverId === userId
        ? 'receiver'
        : 'none';
  const seenAt =
    role === 'sender'
      ? ban.senderResultSeenAt
      : role === 'receiver'
        ? ban.receiverResultSeenAt
        : null;
  if (seenAt) {
    console.log('[result-pending]', {
      userId,
      banId: pendingId,
      role,
      seenAt: seenAt.toISOString(),
      returned: false,
      reason: 'already-seen',
    });
    return null;
  }
  const result = await buildBanResult(pendingId, userId);
  console.log('[result-pending]', {
    userId,
    banId: pendingId,
    role,
    seenAt: null,
    returned: !!result,
    reason: result ? 'found' : 'not-buildable',
  });
  return result;
}

export async function acknowledgeBanResult(
  banId: string,
  userId: string,
): Promise<boolean> {
  const ban = await prisma.ban.findUnique({ where: { id: banId } });
  if (!ban) return false;
  if (ban.senderId !== userId && ban.receiverId !== userId) return false;
  const role = ban.senderId === userId ? 'sender' : 'receiver';
  const field = role === 'sender' ? 'senderResultSeenAt' : 'receiverResultSeenAt';
  await prisma.ban.update({
    where: { id: banId },
    data:
      role === 'sender'
        ? { senderResultSeenAt: new Date() }
        : { receiverResultSeenAt: new Date() },
  });
  console.log('[result-ack]', {
    userId,
    banId,
    role,
    updatedField: field,
  });
  return true;
}

export async function processReminders() {
  const now = Date.now();
  const soon = new Date(now + REMINDER_BEFORE_MS);

  const bans = await prisma.ban.findMany({
    where: {
      status: 'ACTIVE',
      reminderSentAt: null,
      checkDueAt: { lte: soon, gt: new Date() },
    },
    take: 30,
    include: { sender: true, receiver: true },
  });

  for (const ban of bans) {
    await prisma.ban.update({
      where: { id: ban.id },
      data: { reminderSentAt: new Date() },
    });
    await sendTimerReminderNotification(ban.sender.telegramId, ban.text, ban.id);
    await sendTimerReminderNotification(
      ban.receiver.telegramId,
      ban.text,
      ban.id,
    );
  }
}

function logCheckScheduler(payload: Record<string, unknown>) {
  console.log('[check-scheduler]', payload);
}

/** Idempotent ACTIVE → CHECKING when checkDueAt passed; emits WS to both parties. */
export async function processSingleDueCheck(banId: string): Promise<boolean> {
  const now = new Date();
  const ban = await prisma.ban.findUnique({ where: { id: banId } });
  if (!ban) return false;
  if (ban.status !== 'ACTIVE') return false;
  if (!ban.checkDueAt || ban.checkDueAt > now) return false;

  const latenessMs = now.getTime() - ban.checkDueAt.getTime();

  const updated = await prisma.ban.updateMany({
    where: {
      id: banId,
      status: 'ACTIVE',
      checkDueAt: { lte: now },
    },
    data: { status: 'CHECKING', checkStartedAt: now },
  });
  if (updated.count === 0) return false;

  const { cancelCheckDueTimer } = await import('./check-due-timer');
  cancelCheckDueTimer(banId);

  console.log('[check-created]', {
    banId: ban.id,
    senderId: ban.senderId,
    receiverId: ban.receiverId,
    status: 'CHECKING',
    checkDueAt: ban.checkDueAt.toISOString(),
    latenessMs,
  });

  const senderView = await mapBanToInteraction(ban.id, ban.senderId);
  const receiverView = await mapBanToInteraction(ban.id, ban.receiverId);

  if (senderView) {
    console.log('[check-ws-emit]', {
      banId: ban.id,
      toUserId: ban.senderId,
      role: 'sender',
      eventName: 'check:due',
    });
    broadcastToUser(ban.senderId, { type: 'check:due', payload: senderView });
  }
  if (receiverView) {
    console.log('[check-ws-emit]', {
      banId: ban.id,
      toUserId: ban.receiverId,
      role: 'receiver',
      eventName: 'check:due',
    });
    broadcastToUser(ban.receiverId, {
      type: 'check:due',
      payload: receiverView,
    });
  }

  const full = await prisma.ban.findUnique({
    where: { id: ban.id },
    include: { sender: true, receiver: true },
  });
  if (full) {
    await sendCheckNotification(full.sender.telegramId, ban.text, ban.id);
    await sendCheckNotification(full.receiver.telegramId, ban.text, ban.id);
  }
  await syncSession(ban.senderId);
  await syncSession(ban.receiverId);

  return true;
}

export async function processExpiredBans() {
  const now = new Date();
  const due = await prisma.ban.findMany({
    where: {
      checkDueAt: { lte: now },
      status: { in: ['ACTIVE'] },
    },
    take: 50,
  });

  let maxLatenessMs = 0;
  for (const ban of due) {
    if (ban.checkDueAt) {
      maxLatenessMs = Math.max(
        maxLatenessMs,
        now.getTime() - ban.checkDueAt.getTime(),
      );
    }
    await processSingleDueCheck(ban.id);
  }

  logCheckScheduler({
    now: now.toISOString(),
    dueCount: due.length,
    dueBanIds: due.map((b) => b.id),
    maxLatenessMs,
    reasonIfZero: due.length === 0 ? 'no-active-due' : undefined,
  });
}

/** Re-schedule precise timers after process restart (cron still backs up misses). */
export async function hydrateCheckDueTimers(): Promise<void> {
  const now = Date.now();
  const bans = await prisma.ban.findMany({
    where: { status: 'ACTIVE', checkDueAt: { not: null } },
    select: { id: true, checkDueAt: true },
    take: 500,
  });
  const { scheduleCheckDueTimer } = await import('./check-due-timer');
  for (const ban of bans) {
    if (!ban.checkDueAt) continue;
    if (ban.checkDueAt.getTime() <= now) {
      void processSingleDueCheck(ban.id);
    } else {
      scheduleCheckDueTimer(ban.id, ban.checkDueAt);
    }
  }
}

export async function processStaleChecks() {
  const cutoff = new Date(Date.now() - CHECK_TIMEOUT_MINUTES * 60 * 1000);
  const stale = await prisma.ban.findMany({
    where: {
      status: 'CHECKING',
      checkStartedAt: { lte: cutoff },
    },
    take: 30,
    include: { checkAnswers: true, sender: true, receiver: true },
  });

  for (const ban of stale) {
    logCheckScheduler({
      banId: ban.id,
      status: ban.status,
      endsAt: ban.checkDueAt?.toISOString() ?? null,
      shouldCreateCheck: false,
      reason: 'check-timeout',
    });
    const hasSender = ban.checkAnswers.some((a) => a.userId === ban.senderId);
    const hasReceiver = ban.checkAnswers.some(
      (a) => a.userId === ban.receiverId,
    );

    if (!hasSender) {
      await prisma.banCheckAnswer.create({
        data: { banId: ban.id, userId: ban.senderId, completed: false },
      });
      await trackEvent(ANALYTICS_EVENTS.CHECK_IGNORED, ban.senderId, {
        banId: ban.id,
      });
    }
    if (!hasReceiver) {
      await prisma.banCheckAnswer.create({
        data: { banId: ban.id, userId: ban.receiverId, completed: false },
      });
      await trackEvent(ANALYTICS_EVENTS.CHECK_IGNORED, ban.receiverId, {
        banId: ban.id,
      });
    }

    await prisma.ban.update({
      where: { id: ban.id },
      data: {
        status: 'FAILED',
        outcome: 'TIMEOUT' as PrismaOutcome,
        completedAt: new Date(),
        energyApplied: true,
        senderResultSeenAt: null,
        receiverResultSeenAt: null,
      },
    });

    await trackEvent(ANALYTICS_EVENTS.CHECK_TIMEOUT, ban.senderId, {
      banId: ban.id,
    });
    await broadcastResultReady(ban.id, ban.senderId, ban.receiverId);
    await syncSession(ban.senderId);
    await syncSession(ban.receiverId);
  }
}

/** Admin: force expire timer → check */
export async function adminExpireBan(banId: string) {
  const ban = await prisma.ban.findUnique({ where: { id: banId } });
  if (!ban) throw new Error('Not found');
  await prisma.ban.update({
    where: { id: banId },
    data: {
      checkDueAt: new Date(),
      expiresAt: new Date(),
      status: 'ACTIVE',
    },
  });
  await processSingleDueCheck(banId);
}

export async function adminResetBan(banId: string) {
  const { cancelCheckDueTimer } = await import('./check-due-timer');
  cancelCheckDueTimer(banId);
  await prisma.banCheckAnswer.deleteMany({ where: { banId } });
  await prisma.ban.update({
    where: { id: banId },
    data: {
      status: 'PENDING',
      outcome: null,
      energyApplied: false,
      completedAt: null,
      acceptedAt: null,
      expiresAt: null,
      checkDueAt: null,
      checkStartedAt: null,
      reminderSentAt: null,
      senderResultSeenAt: null,
      receiverResultSeenAt: null,
    },
  });
}

export async function adminForceComplete(banId: string, bothYes = true) {
  const ban = await prisma.ban.findUnique({ where: { id: banId } });
  if (!ban) throw new Error('Not found');
  await prisma.ban.update({
    where: { id: banId },
    data: { status: 'CHECKING', checkStartedAt: new Date() },
  });
  await submitCheckAnswer(banId, ban.senderId, bothYes);
  await submitCheckAnswer(banId, ban.receiverId, bothYes);
}
