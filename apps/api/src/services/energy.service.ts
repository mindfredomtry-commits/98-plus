import {
  applyRewardMultiplier,
  calcCheckOutcome,
  calcOverboardPenalty,
  calcSendCost,
  calcSelfBanReward,
  type CheckOutcome,
  type EnergyDelta,
  isLowEnergy,
  LOW_ENERGY_DAILY_BAN_LIMIT,
  ANTI_FARM_DAILY_SUCCESS_LIMIT,
} from '@98plus/shared';
import { prisma } from '../lib/prisma';
import { getDailyCount, incrDaily } from '../lib/redis';

function pairKey(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

function todayDate(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function canSendBan(userId: string): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { allowed: false, reason: 'User not found' };

  if (isLowEnergy(user.energy)) {
    const key = `daily:ban:${userId}`;
    const count = await getDailyCount(key);
    if (count >= LOW_ENERGY_DAILY_BAN_LIMIT) {
      return { allowed: false, reason: '⚡ Энергия снижена. Лимит на сегодня.' };
    }
  }
  return { allowed: true };
}

export async function recordBanSent(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user && isLowEnergy(user.energy)) {
    await incrDaily(`daily:ban:${userId}`);
  }
}

async function shouldSkipFarmRewards(
  userAId: string,
  userBId: string,
): Promise<boolean> {
  const [a, b] = pairKey(userAId, userBId);
  const stat = await prisma.pairDailyStat.findUnique({
    where: {
      userAId_userBId_date: { userAId: a, userBId: b, date: todayDate() },
    },
  });
  return (stat?.successCount ?? 0) >= ANTI_FARM_DAILY_SUCCESS_LIMIT;
}

async function incrementPairSuccess(
  userAId: string,
  userBId: string,
): Promise<void> {
  const [a, b] = pairKey(userAId, userBId);
  await prisma.pairDailyStat.upsert({
    where: {
      userAId_userBId_date: { userAId: a, userBId: b, date: todayDate() },
    },
    create: {
      userAId: a,
      userBId: b,
      date: todayDate(),
      successCount: 1,
      interactionCount: 1,
    },
    update: { successCount: { increment: 1 }, interactionCount: { increment: 1 } },
  });
}

async function incrementPairInteraction(
  userAId: string,
  userBId: string,
): Promise<void> {
  const [a, b] = pairKey(userAId, userBId);
  await prisma.pairDailyStat.upsert({
    where: {
      userAId_userBId_date: { userAId: a, userBId: b, date: todayDate() },
    },
    create: {
      userAId: a,
      userBId: b,
      date: todayDate(),
      interactionCount: 1,
    },
    update: { interactionCount: { increment: 1 } },
  });
}

async function applyDelta(
  userId: string,
  rawDelta: number,
  skipRewards: boolean,
): Promise<number> {
  if (rawDelta === 0) return 0;
  if (skipRewards && rawDelta > 0) return 0;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return 0;

  const delta = applyRewardMultiplier(rawDelta, user.energy);
  await prisma.user.update({
    where: { id: userId },
    data: { energy: { increment: delta } },
  });
  return delta;
}

export async function applySendEnergy(
  senderId: string,
  receiverId: string,
): Promise<{ sender: number; receiver: number }> {
  const { sender, receiver } = calcSendCost();
  const s = await applyDelta(senderId, sender, false);
  await incrementPairInteraction(senderId, receiverId);
  return { sender: s, receiver };
}

/** Pending invite — only sender pays send cost until claim */
export async function applySenderSendCostOnly(senderId: string): Promise<number> {
  const { sender } = calcSendCost();
  return applyDelta(senderId, sender, false);
}

export async function linkPairInteraction(
  userAId: string,
  userBId: string,
): Promise<void> {
  await incrementPairInteraction(userAId, userBId);
}

export async function applyOverboard(
  senderId: string,
  receiverId: string,
): Promise<EnergyDelta> {
  const raw = calcOverboardPenalty();
  const s = await applyDelta(senderId, raw.sender, false);
  const r = await applyDelta(receiverId, raw.receiver, false);
  await incrementPairInteraction(senderId, receiverId);
  return { sender: s, receiver: r };
}

export async function applyCheckResult(
  banId: string,
  outcome: CheckOutcome,
): Promise<EnergyDelta & { farmSkipped: boolean }> {
  const ban = await prisma.ban.findUnique({
    where: { id: banId },
    include: { sender: true, receiver: true },
  });
  if (!ban || ban.energyApplied) {
    return { sender: 0, receiver: 0, farmSkipped: false };
  }

  const skip = await shouldSkipFarmRewards(ban.senderId, ban.receiverId);
  const raw = calcCheckOutcome(outcome);
  const noEnergyApply = process.env.TEST_MODE_NO_ENERGY_APPLY === 'true';

  if (noEnergyApply) {
    const { checkOutcomeToPrisma } = await import('./result.service');
    await prisma.ban.update({
      where: { id: banId },
      data: {
        energyApplied: true,
        status: 'COMPLETED',
        completedAt: new Date(),
        outcome: checkOutcomeToPrisma(outcome),
        senderEnergyDelta: 0,
        receiverEnergyDelta: 0,
        farmSkipped: false,
        senderResultSeenAt: null,
        receiverResultSeenAt: null,
      },
    });
    console.log('[energy-calc]', {
      banId,
      senderId: ban.senderId,
      receiverId: ban.receiverId,
      outcome,
      testModeNoEnergyApply: true,
      rewardSender: 0,
      rewardReceiver: 0,
    });
    return { sender: 0, receiver: 0, farmSkipped: false };
  }

  const senderDelta = await applyDelta(ban.senderId, raw.sender, skip);
  const receiverDelta = await applyDelta(ban.receiverId, raw.receiver, skip);

  console.log('[energy-calc]', {
    banId,
    senderId: ban.senderId,
    receiverId: ban.receiverId,
    outcome,
    multiplier: skip ? 0 : 'energy-scaled',
    antiFarmSkipped: skip,
    rewardSender: senderDelta,
    rewardReceiver: receiverDelta,
  });

  if (outcome === 'both_yes' && !skip) {
    await incrementPairSuccess(ban.senderId, ban.receiverId);
  }

  const { checkOutcomeToPrisma } = await import('./result.service');
  await prisma.ban.update({
    where: { id: banId },
    data: {
      energyApplied: true,
      status: 'COMPLETED',
      completedAt: new Date(),
      outcome: checkOutcomeToPrisma(outcome),
      senderEnergyDelta: senderDelta,
      receiverEnergyDelta: receiverDelta,
      farmSkipped: skip,
      senderResultSeenAt: null,
      receiverResultSeenAt: null,
    },
  });

  return { sender: senderDelta, receiver: receiverDelta, farmSkipped: skip };
}

export function resolveCheckOutcome(
  senderAnswer: boolean,
  receiverAnswer: boolean,
): CheckOutcome {
  if (senderAnswer && receiverAnswer) return 'both_yes';
  if (!senderAnswer && !receiverAnswer) return 'both_no';
  return 'split';
}

export async function applySelfBanReward(
  userId: string,
  isPublic: boolean,
): Promise<number> {
  const raw = calcSelfBanReward(isPublic);
  return applyDelta(userId, raw, false);
}
