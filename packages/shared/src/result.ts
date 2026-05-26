import type { CheckOutcome } from './energy';
import type { UserPublic } from './types';
import { formatSenderDisplayName } from './challenge';

export type InteractionOutcome =
  | CheckOutcome
  | 'overboard'
  | 'timeout'
  | 'expired';

export interface BanCheckConfirmations {
  sender: boolean;
  receiver: boolean;
}

export interface BanResult {
  id: string;
  text: string;
  outcome: InteractionOutcome;
  headline: string;
  subline: string;
  sender: UserPublic;
  receiver: UserPublic;
  viewerId: string | null;
  opponent: UserPublic;
  confirmations: BanCheckConfirmations | null;
  energy: { sender: number; receiver: number };
  farmSkipped: boolean;
  completedAt: string;
  deepLink: string;
  shareLink: string;
  inviteOpponentLink: string;
}

export type ResultViewerRole = 'sender' | 'receiver' | 'observer';

export function getResultViewerRole(
  viewerId: string | null,
  senderId: string,
  receiverId: string,
): ResultViewerRole {
  if (viewerId === senderId) return 'sender';
  if (viewerId === receiverId) return 'receiver';
  return 'observer';
}

const CHECK_HEADLINES: Record<CheckOutcome, string> = {
  split: 'НЕСТЫКОВОЧКА!',
  both_no: 'ЗАТО ЧЕСТНО!',
  both_yes: 'ЗАПРЕТИТЕЛЬНО!',
};

export function formatResultHeadline(outcome: InteractionOutcome): string {
  if (outcome === 'both_yes' || outcome === 'both_no' || outcome === 'split') {
    return CHECK_HEADLINES[outcome];
  }
  return RESULT_COPY[outcome].headline;
}

export function formatResultSubline(
  outcome: InteractionOutcome,
  role: ResultViewerRole,
  sender: UserPublic,
  receiver: UserPublic,
): string {
  const senderName = formatSenderDisplayName(sender.username, sender.firstName);
  const receiverName = formatSenderDisplayName(
    receiver.username,
    receiver.firstName,
  );

  if (role === 'observer') {
    return RESULT_COPY[outcome]?.subline ?? '';
  }

  if (outcome === 'split') {
    if (role === 'receiver') {
      return `${senderName} думает, что ты не выполнил запрет!`;
    }
    if (role === 'sender') {
      return `${receiverName} думает, что он не выполнил запрет!`;
    }
  }

  if (outcome === 'both_no') {
    if (role === 'receiver') {
      return `${senderName} согласен, что ты не выполнил запрет!`;
    }
    return `${receiverName} признал, что он не выполнил запрет!`;
  }

  if (outcome === 'both_yes') {
    if (role === 'receiver') {
      return `${senderName} согласен, что ты выполнил запрет!`;
    }
    return `${receiverName} выполнил запрет!`;
  }

  return RESULT_COPY[outcome]?.subline ?? '';
}

export function buildResultPresentation(
  outcome: InteractionOutcome,
  viewerId: string | null,
  sender: UserPublic,
  receiver: UserPublic,
  confirmations: BanCheckConfirmations | null,
): { headline: string; subline: string } {
  const role = getResultViewerRole(viewerId, sender.id, receiver.id);
  return {
    headline: formatResultHeadline(outcome),
    subline: formatResultSubline(outcome, role, sender, receiver),
  };
}

/** Fallback copy for non-check outcomes and observers. */
export const RESULT_COPY: Record<
  InteractionOutcome,
  { headline: string; subline: string }
> = {
  both_yes: {
    headline: 'ЗАПРЕТИТЕЛЬНО!',
    subline: 'Оба подтвердили выполнение.',
  },
  both_no: {
    headline: 'ЗАТО ЧЕСТНО!',
    subline: 'Оба подтвердили невыполнение.',
  },
  split: {
    headline: 'НЕСТЫКОВОЧКА!',
    subline: 'Ответы не совпали.',
  },
  overboard: {
    headline: 'ПЕРЕБОР',
    subline: '−8 ⚡ обоим.',
  },
  timeout: {
    headline: 'ТАЙМАУТ',
    subline: 'Проверка не завершена.',
  },
  expired: {
    headline: 'ВРЕМЯ ВЫШЛО',
    subline: 'Запрет истёк.',
  },
};
