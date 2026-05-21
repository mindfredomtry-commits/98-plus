import type { CheckOutcome } from './energy';
import type { UserPublic } from './types';

export type InteractionOutcome =
  | CheckOutcome
  | 'overboard'
  | 'timeout'
  | 'expired';

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
  energy: { sender: number; receiver: number };
  farmSkipped: boolean;
  completedAt: string;
  deepLink: string;
  shareLink: string;
  inviteOpponentLink: string;
}

export const RESULT_COPY: Record<
  InteractionOutcome,
  { headline: string; subline: string }
> = {
  both_yes: {
    headline: '⚡ Оба выдержали',
    subline: 'Social reality stable.',
  },
  both_no: {
    headline: '❌ Никто не выдержал',
    subline: '⚡ Interaction collapsed.',
  },
  split: {
    headline: '⚠️ Social reality unstable',
    subline: 'Кто-то врёт.',
  },
  overboard: {
    headline: '⚠️ ПЕРЕБОР',
    subline: '−8 ⚡ обоим.',
  },
  timeout: {
    headline: '⏱ Таймаут проверки',
    subline: '⚡ Interaction incomplete.',
  },
  expired: {
    headline: '⏱ Время вышло',
    subline: 'Запрет истёк.',
  },
};
