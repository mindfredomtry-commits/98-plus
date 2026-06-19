import { INCOMING_PENDING_MAX_AGE_MS } from '@98plus/shared';

export type PendingRejectDiagnostic = {
  banId: string;
  reason: string;
  status: string;
  receiverIncomingAckAt: string | null;
  handledAt: string | null;
  hasCounterBan: boolean;
  counterBanId: string | null;
  createdAt: string;
  isOverboard: boolean;
  receiverId: string;
  senderId: string;
  viewerId: string;
  acked: boolean;
  handledAtSet: boolean;
  tooOld: boolean;
};

export async function viewerTelegramId(
  viewerId: string,
): Promise<string | null> {
  const { prisma } = await import('./prisma');
  const user = await prisma.user.findUnique({
    where: { id: viewerId },
    select: { telegramId: true },
  });
  return user?.telegramId != null ? String(user.telegramId) : null;
}

export function logApiPendingBansQuery(data: Record<string, unknown>): void {
  console.log('[API PENDING BANS QUERY]', data);
}

export function logApiDirectBanOpenQuery(data: Record<string, unknown>): void {
  console.log('[API DIRECT BAN OPEN QUERY]', data);
}

export function isIncomingForViewerOnRow(
  ban: {
    receiverId: string;
    senderId: string;
    status: string;
    checkDueAt?: Date | null;
  },
  viewerId: string,
): boolean {
  return (
    ban.receiverId === viewerId &&
    ban.status === 'PENDING' &&
    !ban.checkDueAt
  );
}

type PendingRejectBanRow = {
  id: string;
  receiverId: string;
  senderId: string;
  status: string;
  receiverIncomingAckAt: Date | null;
  handledAt: Date | null;
  createdAt: Date;
  isOverboard: boolean;
  _count: { counterBans: number };
  counterBans?: Array<{ id: string }>;
};

export function pendingSqlExcludeReason(
  ban: PendingRejectBanRow,
  userId: string,
  cutoff: Date,
): string | null {
  if (ban.receiverId !== userId) return 'receiver mismatch';
  if (ban.status !== 'PENDING') return 'status mismatch';
  if (ban.receiverIncomingAckAt) return 'all acked';
  if (ban.isOverboard) return 'is overboard';
  if (ban.handledAt) return 'handledAt set';
  if (ban.createdAt < cutoff) return 'too old';
  if (ban._count.counterBans > 0) return 'has counterBan';
  return null;
}

export function buildPendingRejectDiagnostic(
  ban: PendingRejectBanRow,
  viewerId: string,
  cutoff: Date,
  reason: string,
): PendingRejectDiagnostic {
  return {
    banId: ban.id,
    reason,
    status: ban.status,
    receiverIncomingAckAt: ban.receiverIncomingAckAt?.toISOString() ?? null,
    handledAt: ban.handledAt?.toISOString() ?? null,
    hasCounterBan: ban._count.counterBans > 0,
    counterBanId: ban.counterBans?.[0]?.id ?? null,
    createdAt: ban.createdAt.toISOString(),
    isOverboard: ban.isOverboard,
    receiverId: ban.receiverId,
    senderId: ban.senderId,
    viewerId,
    acked: Boolean(ban.receiverIncomingAckAt),
    handledAtSet: Boolean(ban.handledAt),
    tooOld: ban.createdAt < cutoff,
  };
}

export function incomingPendingCutoff(): Date {
  return new Date(Date.now() - INCOMING_PENDING_MAX_AGE_MS);
}

const pendingRejectInclude = {
  _count: { select: { counterBans: true } },
  counterBans: { select: { id: true }, take: 1 },
} as const;

export { pendingRejectInclude };
