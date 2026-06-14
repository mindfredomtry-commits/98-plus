import { banTextEssence } from '@98plus/shared';
import { prisma } from '../lib/prisma';

const MIN_PAIR_BAN_TEXT_LEN = 3;
const MAX_RETENTION_ESSENCE_LEN = 120;

const EXCLUDED_PAIR_BAN_STATUSES = ['PENDING'] as const;

function pairBanWhere(userId: string, friendId: string) {
  return {
    OR: [
      { senderId: userId, receiverId: friendId },
      { senderId: friendId, receiverId: userId },
    ],
  };
}

export function isUsablePairBanText(raw: string): boolean {
  const text = raw.trim();
  if (text.length < MIN_PAIR_BAN_TEXT_LEN) return false;
  const essence = banTextEssence(text);
  if (!essence || essence === '…') return false;
  if (essence.length > MAX_RETENTION_ESSENCE_LEN) return false;
  return true;
}

export type ViralInviteBootMode = 'fresh' | 'history';

export async function resolveViralInviteBootContext(
  viewerId: string,
  inviterId: string,
): Promise<
  | { mode: 'fresh' }
  | { mode: 'history'; banId: string; banText: string; durationMinutes: number }
> {
  if (!viewerId || !inviterId || viewerId === inviterId) {
    return { mode: 'fresh' };
  }

  const historyCount = await prisma.ban.count({
    where: pairBanWhere(viewerId, inviterId),
  });
  if (historyCount === 0) {
    return { mode: 'fresh' };
  }

  const candidates = await prisma.ban.findMany({
    where: {
      ...pairBanWhere(viewerId, inviterId),
      funMode: false,
      status: { notIn: [...EXCLUDED_PAIR_BAN_STATUSES] },
    },
    orderBy: { createdAt: 'desc' },
    take: 24,
    select: { id: true, text: true, durationMinutes: true },
  });

  for (const ban of candidates) {
    if (!isUsablePairBanText(ban.text)) continue;
    return {
      mode: 'history',
      banId: ban.id,
      banText: ban.text.trim(),
      durationMinutes: ban.durationMinutes,
    };
  }

  return { mode: 'fresh' };
}
