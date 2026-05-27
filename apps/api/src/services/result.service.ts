import { InteractionOutcome as PrismaOutcome } from '@prisma/client';
import {
  buildResultPresentation,
  type BanCheckConfirmations,
  type BanResult,
  type CheckOutcome,
  type InteractionOutcome,
  type UserPublic,
} from '@98plus/shared';
import { prisma } from '../lib/prisma';
import { inviteLinkForUser, miniAppLink, shareLink } from '../lib/deeplink';
import { mapUser } from './user-mapper';

function prismaToShared(o: PrismaOutcome): InteractionOutcome {
  const map: Record<PrismaOutcome, InteractionOutcome> = {
    BOTH_YES: 'both_yes',
    BOTH_NO: 'both_no',
    SPLIT: 'split',
    OVERBOARD: 'overboard',
    TIMEOUT: 'timeout',
    EXPIRED: 'expired',
  };
  return map[o];
}

function sharedToPrisma(o: CheckOutcome): PrismaOutcome {
  const map: Record<CheckOutcome, PrismaOutcome> = {
    both_yes: 'BOTH_YES',
    both_no: 'BOTH_NO',
    split: 'SPLIT',
  };
  return map[o];
}

export function checkOutcomeToPrisma(o: CheckOutcome): PrismaOutcome {
  return sharedToPrisma(o);
}

export function overboardToPrisma(): PrismaOutcome {
  return 'OVERBOARD';
}

export async function buildBanResult(
  banId: string,
  viewerId: string | null,
): Promise<BanResult | null> {
  const ban = await prisma.ban.findUnique({
    where: { id: banId },
    include: { sender: true, receiver: true, checkAnswers: true },
  });

  if (!ban) return null;
  if (viewerId && viewerId !== ban.senderId && viewerId !== ban.receiverId) {
    return null;
  }

  const terminal = ['COMPLETED', 'OVERBOARD', 'FAILED', 'EXPIRED'];
  if (!terminal.includes(ban.status) && !ban.outcome) {
    return null;
  }

  const outcome: InteractionOutcome = ban.outcome
    ? prismaToShared(ban.outcome)
    : ban.isOverboard
      ? 'overboard'
      : 'both_no';

  const sender = mapUser(ban.sender);
  const receiver = mapUser(ban.receiver);

  const senderAns = ban.checkAnswers.find((a) => a.userId === ban.senderId);
  const receiverAns = ban.checkAnswers.find((a) => a.userId === ban.receiverId);
  const confirmations: BanCheckConfirmations | null =
    senderAns && receiverAns
      ? { sender: senderAns.completed, receiver: receiverAns.completed }
      : null;

  const copy = buildResultPresentation(
    outcome,
    viewerId,
    sender,
    receiver,
    confirmations,
  );

  const opponent =
    viewerId === ban.senderId
      ? receiver
      : viewerId === ban.receiverId
        ? sender
        : receiver;

  const opponentUsername =
    viewerId === ban.senderId
      ? ban.receiver.username
      : ban.sender.username;

  const inviteOpponentLink =
    inviteLinkForUser(opponentUsername ?? opponent.username ?? 'friend') ?? '';

  return {
    id: ban.id,
    text: ban.text,
    outcome,
    headline: copy.headline,
    subline: copy.subline,
    sender,
    receiver,
    viewerId,
    opponent,
    confirmations,
    energy: {
      sender: ban.senderEnergyDelta ?? 0,
      receiver: ban.receiverEnergyDelta ?? 0,
    },
    farmSkipped: ban.farmSkipped,
    completedAt: (ban.completedAt ?? ban.createdAt).toISOString(),
    deepLink: miniAppLink({ type: 'result', banId: ban.id }),
    shareLink: shareLink(
      { type: 'result', banId: ban.id },
      `${copy.headline}\n«${ban.text}»\n\n98+`,
    ),
    inviteOpponentLink,
  };
}
