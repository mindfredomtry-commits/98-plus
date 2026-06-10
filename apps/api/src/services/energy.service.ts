import {
  applyRewardMultiplier,
  calcCheckOutcome,
  calcOverboardPenalty,
  calcSendCost,
  calcSelfBanReward,
  type CheckOutcome,
  type EnergyDelta,
  hasEnoughEnergyToSendBan,
  INSUFFICIENT_ENERGY_ERROR,
  isLowEnergy,
  isPairDailyFreeMode,
  LOW_ENERGY_DAILY_BAN_LIMIT,
  ANTI_FARM_DAILY_SUCCESS_LIMIT,
  type CanSendBanCode,
} from '@98plus/shared';
import { prisma } from '../lib/prisma';
import { getDailyCount, incrDaily } from '../lib/redis';
import {
  banResultRowInclude,
  type BanResultRow,
} from './result.service';

function pairKey(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

function todayDate(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function tomorrowDate(): Date {
  const d = todayDate();
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/** All bans between pair today — any status, either direction. */
async function countPairBansToday(
  userAId: string,
  userBId: string,
): Promise<number> {
  const [a, b] = pairKey(userAId, userBId);
  const start = todayDate();
  const end = tomorrowDate();

  return prisma.ban.count({
    where: {
      createdAt: { gte: start, lt: end },
      OR: [
        { senderId: a, receiverId: b },
        { senderId: b, receiverId: a },
      ],
    },
  });
}

async function isPairFreeMode(
  userAId: string,
  userBId: string,
): Promise<{ free: boolean; countToday: number }> {
  const countToday = await countPairBansToday(userAId, userBId);
  const free = isPairDailyFreeMode(countToday);
  if (free) {
    const [a, b] = pairKey(userAId, userBId);
    console.info('[98+] pair free mode', {
      pairKey: `${a}:${b}`,
      countToday,
      reason: 'pair_daily_limit',
    });
  }
  return { free, countToday };
}

export async function canSendBan(userId: string): Promise<{
  allowed: boolean;
  reason?: string;
  code?: CanSendBanCode;
}> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { allowed: false, reason: 'User not found' };

  if (!hasEnoughEnergyToSendBan(user.energy)) {
    return {
      allowed: false,
      code: INSUFFICIENT_ENERGY_ERROR,
      reason:
        'Выполни пару запретов от других — и сможешь запрещать снова!',
    };
  }

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

type ApplyDeltaOpts = {
  skipPositiveRewards?: boolean;
  pairFreeMode?: boolean;
};

async function applyDelta(
  userId: string,
  rawDelta: number,
  opts: ApplyDeltaOpts = {},
): Promise<number> {
  if (rawDelta === 0) return 0;
  if (opts.pairFreeMode) return 0;
  if (opts.skipPositiveRewards && rawDelta > 0) return 0;

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
  opts: ApplyDeltaOpts = {},
): Promise<{ sender: number; receiver: number }> {
  if (opts.pairFreeMode) {
    return { sender: 0, receiver: 0 };
  }
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
    if (opts.skipPositiveRewards && rawDelta > 0) {
      return { delta: 0, increment: false };
    }
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
  const { free: pairFreeMode } = await isPairFreeMode(senderId, receiverId);
  await incrementPairInteraction(senderId, receiverId);

  if (pairFreeMode) {
    return { sender: 0, receiver: 0 };
  }

  const { sender } = calcSendCost();
  const s = await applyDelta(senderId, sender, { pairFreeMode: false });
  return { sender: s, receiver: 0 };
}

/** Pending invite — only sender pays send cost until claim */
export async function applySenderSendCostOnly(senderId: string): Promise<number> {
  const { sender } = calcSendCost();
  return applyDelta(senderId, sender, { pairFreeMode: false });
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
): Promise<
  EnergyDelta & { funMode: boolean; pairBanCount24h: number }
> {
  const { free: pairFreeMode, countToday } = await isPairFreeMode(
    senderId,
    receiverId,
  );
  await incrementPairInteraction(senderId, receiverId);

  if (pairFreeMode) {
    return {
      sender: 0,
      receiver: 0,
      funMode: true,
      pairBanCount24h: countToday,
    };
  }

  const raw = calcOverboardPenalty();
  const s = await applyDelta(senderId, raw.sender, { pairFreeMode: false });
  const r = await applyDelta(receiverId, raw.receiver, { pairFreeMode: false });
  return {
    sender: s,
    receiver: r,
    funMode: false,
    pairBanCount24h: countToday,
  };
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
): Promise<EnergyDelta & { farmSkipped: boolean; completedBan: BanResultRow }> {
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
      include: banResultRowInclude,
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
      include: banResultRowInclude,
    });
    return { sender: 0, receiver: 0, farmSkipped: false, completedBan };
  }

  const { free: pairFreeMode, countToday: pairBanCount24h } =
    await isPairFreeMode(ban.senderId, ban.receiverId);
  const skipPositiveRewards =
    !pairFreeMode &&
    (await shouldSkipFarmRewards(ban.senderId, ban.receiverId));
  const farmSkipped = pairFreeMode || skipPositiveRewards;

  const { sender: senderDelta, receiver: receiverDelta } =
    await applyCheckPairDeltas(ban.senderId, ban.receiverId, raw, {
      pairFreeMode,
      skipPositiveRewards,
    });

  if (outcome === 'both_yes' && !pairFreeMode && !skipPositiveRewards) {
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
      farmSkipped,
      funMode: pairFreeMode,
      pairBanCount24h,
      senderResultSeenAt: null,
      receiverResultSeenAt: null,
    },
    include: banResultRowInclude,
  });

  return {
    sender: senderDelta,
    receiver: receiverDelta,
    farmSkipped,
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
  return applyDelta(userId, raw, { pairFreeMode: false });
}
