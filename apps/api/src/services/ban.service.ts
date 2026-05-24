import { BanStatus, InteractionOutcome as PrismaOutcome } from '@prisma/client';
import {
  SYSTEM_VOICE,
  formatChallengeShareMessage,
  isValidDurationMinutes,
  ANALYTICS_EVENTS,
  CHECK_TIMEOUT_MINUTES,
  REMINDER_BEFORE_MS,
  COOLDOWN_CHECK_SECONDS,
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
  sendCheckNotification,
  sendIncomingBanNotification,
  sendResultNotification,
  sendTimerReminderNotification,
} from '../bot/notifications';
import { buildBanResult, checkOutcomeToPrisma, overboardToPrisma } from './result.service';
import { miniAppLink } from '../lib/deeplink';
import { trackEvent } from './analytics.service';
import { createPendingInvite, normalizeUsername } from './invite.service';
import { recordSocialContact } from './social-graph.service';
import { applySenderSendCostOnly } from './energy.service';
import {
  ensureDevFixturesForUser,
  ensureDevPeerUser,
  isDevModeUser,
  isDevTelegramId,
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

async function broadcastResultReady(
  banId: string,
  senderId: string,
  receiverId: string,
) {
  const resultSender = await buildBanResult(banId, senderId);
  const resultReceiver = await buildBanResult(banId, receiverId);
  if (resultSender) {
    broadcastToUser(senderId, {
      type: 'check:completed',
      payload: resultSender,
    });
  }
  if (resultReceiver) {
    broadcastToUser(receiverId, {
      type: 'check:completed',
      payload: resultReceiver,
    });
  }
  const ban = await prisma.ban.findUnique({
    where: { id: banId },
    include: { sender: true, receiver: true },
  });
  if (ban && resultSender) {
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
  }
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
    if (!receiver && devMode) {
      await ensureDevPeerUser();
      receiver = await findUserByUsername(params.receiverUsername);
    }
  }

  if (!receiver && params.receiverUsername) {
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
  if (receiver.id === senderId) throw new Error('Нельзя запретить себе.');

  const pairKey =
    senderId < receiver.id
      ? `${senderId}:${receiver.id}`
      : `${receiver.id}:${senderId}`;
  if (
    !devMode &&
    (await hasCooldown(`cooldown:pair:${pairKey}`))
  ) {
    throw new Error('Слишком часто с этим человеком.');
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

  await setCooldown(`cooldown:send:${senderId}`, COOLDOWN_SEND);
  await setCooldown(`cooldown:pair:${pairKey}`, 20);
  const energy = await applySendEnergy(senderId, receiver.id);
  await recordBanSent(senderId);
  await trackEvent(ANALYTICS_EVENTS.BAN_SENT, senderId, {
    banId: ban.id,
    durationMinutes,
  });

  const interaction = (await mapBanToInteraction(ban.id, receiver.id))!;

  broadcastToUser(receiver.id, { type: 'ban:incoming', payload: interaction });

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

  const senderUser = ban.sender;
  const senderUsername =
    senderUser.username ?? senderUser.firstName;

  const receiverLabel =
    receiver.firstName ?? receiver.username ?? undefined;

  const notifyDev =
    isDevTelegramId(receiver.telegramId) &&
    isDevTelegramId(ban.sender.telegramId);

  if (!notifyDev) {
    await sendIncomingBanNotification(
      receiver.telegramId,
      text,
      ban.id,
      false,
      senderUsername,
      durationMinutes,
      senderUser.firstName,
      senderUser.photoUrl,
    );
    await sendIncomingBanNotification(
      ban.sender.telegramId,
      text,
      ban.id,
      true,
      senderUsername,
      durationMinutes,
      undefined,
      undefined,
      receiverLabel,
    );
  }

  await syncSession(receiver.id);
  await syncSession(senderId);

  return {
    ban: interaction,
    energyDelta: energy.sender,
    pending: false,
    requiresShare: false,
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

  await trackEvent(ANALYTICS_EVENTS.BAN_ACCEPTED, userId, { banId });

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
  if (parent.status !== 'PENDING') {
    throw new Error('Already handled');
  }

  if (!isValidDurationMinutes(params.durationMinutes)) {
    throw new Error('Invalid duration');
  }

  const can = await canSendBan(params.userId);
  if (!can.allowed) throw new Error(can.reason ?? 'Not allowed');

  await prisma.ban.update({
    where: { id: parent.id },
    data: {
      status: 'REPLIED',
      handledAt: new Date(),
      completedAt: new Date(),
    },
  });

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

  const pairKey =
    params.userId < parent.senderId
      ? `${params.userId}:${parent.senderId}`
      : `${parent.senderId}:${params.userId}`;
  await setCooldown(`cooldown:send:${params.userId}`, COOLDOWN_SEND);
  await setCooldown(`cooldown:pair:${pairKey}`, 20);
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

  await prisma.banCheckAnswer.upsert({
    where: { banId_userId: { banId, userId } },
    create: { banId, userId, completed },
    update: { completed },
  });

  await trackEvent(ANALYTICS_EVENTS.CHECK_ANSWERED, userId, {
    banId,
    completed,
  });

  const answers = await prisma.banCheckAnswer.findMany({ where: { banId } });

  if (answers.length < 2) {
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

  const { resolveCheckOutcome, applyCheckResult } = await import('./energy.service');
  const outcome = resolveCheckOutcome(senderAns.completed, receiverAns.completed);
  const energy = await applyCheckResult(banId, outcome);

  const msg =
    outcome === 'split' ? SYSTEM_VOICE.socialUnstable : SYSTEM_VOICE.checkComplete;

  broadcastEnergyPopup(ban.senderId, energy.sender, msg);
  broadcastEnergyPopup(ban.receiverId, energy.receiver, msg);
  await broadcastResultReady(banId, ban.senderId, ban.receiverId);

  const result = await buildBanResult(banId, userId);
  await syncSession(ban.senderId);
  await syncSession(ban.receiverId);

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

export async function resolveDeepLinkBan(banId: string, userId: string) {
  const ban = await prisma.ban.findUnique({ where: { id: banId } });
  if (!ban) return null;
  if (ban.receiverId === userId && ban.status === 'PENDING') {
    return mapBanToInteraction(banId, userId);
  }
  if (ban.status === 'CHECKING') {
    return mapBanToInteraction(banId, userId);
  }
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

export async function getPendingIncoming(userId: string) {
  const ban = await prisma.ban.findFirst({
    where: { receiverId: userId, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  });
  if (!ban) return null;
  return mapBanToInteraction(ban.id, userId);
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

export async function getLatestPendingResultId(userId: string) {
  const ban = await prisma.ban.findFirst({
    where: {
      OR: [{ senderId: userId }, { receiverId: userId }],
      status: { in: ['COMPLETED', 'OVERBOARD', 'FAILED'] },
      outcome: { not: null },
    },
    orderBy: { completedAt: 'desc' },
  });
  return ban?.id ?? null;
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

export async function processExpiredBans() {
  const now = new Date();
  const due = await prisma.ban.findMany({
    where: {
      checkDueAt: { lte: now },
      status: { in: ['ACTIVE'] },
    },
    take: 50,
  });

  for (const ban of due) {
    await prisma.ban.update({
      where: { id: ban.id },
      data: { status: 'CHECKING', checkStartedAt: new Date() },
    });

    const interaction = await mapBanToInteraction(ban.id, ban.senderId);
    broadcastToUser(ban.senderId, { type: 'check:due', payload: interaction });
    broadcastToUser(ban.receiverId, { type: 'check:due', payload: interaction });

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
  await processExpiredBans();
}

export async function adminResetBan(banId: string) {
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
