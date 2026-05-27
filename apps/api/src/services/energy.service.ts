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

/** One user fetch for both participants — fewer round-trips on check complete. */
async function applyCheckPairDeltas(
  senderId: string,
  receiverId: string,
  raw: { sender: number; receiver: number },
  skipRewards: boolean,
): Promise<{ sender: number; receiver: number }> {
  if (raw.sender === 0 && raw.receiver === 0) {
    return { sender: 0, receiver: 0 };
  }

  const users = await prisma.user.findMany({
    where: { id: { in: [senderId, receiverId] } },
    select: { id: true, energy: true },
  });
  const senderUser = users.find((u) => u.id === senderId);
  const receiverUser = users.find((u) => u.id === receiverId);

  const calc = (user: { energy: number } | undefined, rawDelta: number) => {
    if (rawDelta === 0) return { delta: 0, increment: false };
    if (skipRewards && rawDelta > 0) return { delta: 0, increment: false };
    if (!user) return { delta: 0, increment: false };
    const delta = applyRewardMultiplier(rawDelta, user.energy);
    return { delta, increment: delta !== 0 };
  };

  const s = calc(senderUser, raw.sender);
  const r = calc(receiverUser, raw.receiver);

  const updates: Promise<unknown>[] = [];
  if (s.increment && senderUser) {
    updates.push(
      prisma.user.update({
        where: { id: senderId },
        data: { energy: { increment: s.delta } },
      }),
    );
  }
  if (r.increment && receiverUser) {
    updates.push(
      prisma.user.update({
        where: { id: receiverId },
        data: { energy: { increment: r.delta } },
      }),
    );
  }
  if (updates.length > 0) await Promise.all(updates);

  return { sender: s.delta, receiver: r.delta };
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

type CheckResultBanRow = {
  id: string;
  senderId: string;
  receiverId: string;
  energyApplied: boolean;
  senderEnergyDelta: number | null;
  receiverEnergyDelta: number | null;
  farmSkipped: boolean;
};

export async function applyCheckResult(
  banId: string,
  outcome: CheckOutcome,
  knownBan?: CheckResultBanRow | null,
): Promise<
  EnergyDelta & {
    farmSkipped: boolean;
    completedBan: Awaited<
      ReturnType<typeof prisma.ban.findUnique>
    > & {
      sender: NonNullable<Awaited<ReturnType<typeof prisma.ban.findUnique>>> extends infer B
        ? B extends { sender: infer S }
          ? S
          : never
        : never;
      receiver: NonNullable<Awaited<ReturnType<typeof prisma.ban.findUnique>>> extends infer B
        ? B extends { receiver: infer R }
          ? R
          : never
        : never;
      checkAnswers: { userId: string; completed: boolean }[];
    };
  }
> {
  const ban =
    knownBan ??
    (await prisma.ban.findUnique({
      where: { id: banId },
      select: {
        id: true,
        senderId: true,
        receiverId: true,
        energyApplied: true,
        senderEnergyDelta: true,
        receiverEnergyDelta: true,
        farmSkipped: true,
      },
    }));

  if (!ban) {
    throw new Error('Ban not found');
  }

  if (ban.energyApplied) {
    const completedBan = await prisma.ban.findUnique({
      where: { id: banId },
      include: { sender: true, receiver: true, checkAnswers: true },
    });
    if (!completedBan) throw new Error('Ban not found');
    return {
      sender: ban.senderEnergyDelta ?? 0,
      receiver: ban.receiverEnergyDelta ?? 0,
      farmSkipped: ban.farmSkipped ?? false,
      completedBan,
    };
  }

  const { checkOutcomeToPrisma } = await import('./result.service');
  const prismaOutcome = checkOutcomeToPrisma(outcome);
  const raw = calcCheckOutcome(outcome);
  const noEnergyApply = process.env.TEST_MODE_NO_ENERGY_APPLY === 'true';

  if (noEnergyApply) {
    const completedBan = await prisma.ban.update({
      where: { id: banId },
      data: {
        energyApplied: true,
        status: 'COMPLETED',
        completedAt: new Date(),
        outcome: prismaOutcome,
        senderEnergyDelta: 0,
        receiverEnergyDelta: 0,
        farmSkipped: false,
        senderResultSeenAt: null,
        receiverResultSeenAt: null,
      },
      include: { sender: true, receiver: true, checkAnswers: true },
    });
    return { sender: 0, receiver: 0, farmSkipped: false, completedBan };
  }

  const skip = await shouldSkipFarmRewards(ban.senderId, ban.receiverId);
  const { sender: senderDelta, receiver: receiverDelta } = await applyCheckPairDeltas(
    ban.senderId,
    ban.receiverId,
    raw,
    skip,
  );

  if (outcome === 'both_yes' && !skip) {
    void incrementPairSuccess(ban.senderId, ban.receiverId);
  }

  const completedBan = await prisma.ban.update({
    where: { id: banId },
    data: {
      energyApplied: true,
      status: 'COMPLETED',
      completedAt: new Date(),
      outcome: prismaOutcome,
      senderEnergyDelta: senderDelta,
      receiverEnergyDelta: receiverDelta,
      farmSkipped: skip,
      senderResultSeenAt: null,
      receiverResultSeenAt: null,
    },
    include: { sender: true, receiver: true, checkAnswers: true },
  });

  return {
    sender: senderDelta,
    receiver: receiverDelta,
    farmSkipped: skip,
    completedBan,
  };
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
