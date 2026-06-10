import type { CheckOutcome } from './energy';
import { isPairDailyFreeMode } from './energy';
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

export type ResultEconomyMode = 'normal' | 'fun';

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
  /** Pair exceeded daily ban cap — energy economy disabled for this result. */
  funMode?: boolean;
  /** @deprecated alias — use funMode */
  isFunMode?: boolean;
  economyMode?: ResultEconomyMode;
  /** Pair ban count in rolling 24h window at result creation (dev / diagnostics). */
  pairBanCount24h?: number | null;
  completedAt: string;
  deepLink: string;
  shareLink: string;
  inviteOpponentLink: string;
}

/** Fun mode from incoming ban payload — never infer from energy delta alone. */
export function isIncomingPairFunMode(ban: {
  funMode?: boolean;
  isFunMode?: boolean;
  economyMode?: ResultEconomyMode | string | null;
  pairBanCount24h?: number | null;
}): boolean {
  if (ban.funMode === true || ban.isFunMode === true || ban.economyMode === 'fun') {
    return true;
  }
  const count = ban.pairBanCount24h;
  return count != null && isPairDailyFreeMode(count);
}

/** Explicit fun-mode flag — never infer from energy delta alone. */
export function isResultFunMode(result: {
  funMode?: boolean;
  isFunMode?: boolean;
  economyMode?: ResultEconomyMode | string | null;
}): boolean {
  return (
    result.funMode === true ||
    result.isFunMode === true ||
    result.economyMode === 'fun'
  );
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

/** Lowercase product labels for history list (not modal headlines). */
export const HISTORY_OUTCOME_LABELS: Partial<
  Record<InteractionOutcome, string>
> = {
  both_yes: 'запретительно',
  both_no: 'зато честно',
  split: 'нестыковочка',
  overboard: 'перебор',
};

export function formatHistoryOutcomeLabel(
  outcome: InteractionOutcome | null | undefined,
  banStatus?: string,
): string {
  if (outcome && HISTORY_OUTCOME_LABELS[outcome]) {
    return HISTORY_OUTCOME_LABELS[outcome]!;
  }
  if (banStatus === 'overboard') {
    return HISTORY_OUTCOME_LABELS.overboard!;
  }
  return 'статус неизвестен';
}

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

/** Result modal headline — normal pair mode uses «ЗАПРЕТНО!» for mutual success. */
export function getResultCardHeadline(
  outcome: InteractionOutcome,
  farmSkipped: boolean,
  fallbackHeadline: string,
): string {
  if (outcome === 'both_yes' && !farmSkipped) {
    return 'ЗАПРЕТНО!';
  }
  return fallbackHeadline;
}

const FREE_MODE_RESULT_ACTION_OUTCOMES: InteractionOutcome[] = [
  'both_yes',
  'both_no',
  'split',
];

/** Whether the result card should offer «Запретить другим!» (pair free mode). */
export function showFreeModeBanOthersAction(
  farmSkipped: boolean,
  outcome: InteractionOutcome,
): boolean {
  return farmSkipped && FREE_MODE_RESULT_ACTION_OUTCOMES.includes(outcome);
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
