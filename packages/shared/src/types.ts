import type { AuraLevel } from './energy';
import type { BanDurationMinutes } from './constants';
import { BAN_DURATIONS_MINUTES } from './constants';

export type BanStatus =
  | 'pending'
  | 'active'
  | 'replied'
  | 'countered'
  | 'overboard'
  | 'checking'
  | 'completed'
  | 'expired'
  | 'failed';

/** Fullscreen incoming overlay only for pending incoming challenges */
export function isIncomingOverlayBan(
  ban: BanInteraction | null | undefined,
): boolean {
  return Boolean(ban?.isIncoming && ban.status === 'pending');
}

export interface UserPublic {
  id: string;
  telegramId: string;
  username: string | null;
  firstName: string;
  photoUrl: string | null;
  aura: AuraLevel;
  auraLabel: string;
  energyPercent: number;
  streak: number;
  isOnboarded: boolean;
}

export interface BanInteraction {
  id: string;
  text: string;
  status: BanStatus;
  durationMinutes: BanDurationMinutes;
  sender: UserPublic;
  receiver: UserPublic;
  isIncoming: boolean;
  createdAt: string;
  expiresAt: string | null;
  checkDueAt: string | null;
  threadId: string;
  remainingMs?: number;
  serverNow?: string;
}

export interface CheckState {
  banId: string;
  answered: boolean;
  myAnswer: boolean | null;
  waitingForPartner: boolean;
  partnerAnswered: boolean;
}

export interface SessionState {
  serverNow: string;
  incoming: BanInteraction | null;
  check: BanInteraction | null;
  checkWaiting: boolean;
  waiting: { ban: BanInteraction; checkState: CheckState } | null;
  active: BanInteraction[];
  pendingResultId: string | null;
  needsOnboardingRecovery?: boolean;
}

export interface SelfBanItem {
  id: string;
  text: string;
  isPublic: boolean;
  createdAt: string;
}

export interface EnergyPopup {
  id: string;
  delta: number;
  message?: string;
}

export interface WsEvent {
  type:
    | 'ban:incoming'
    | 'ban:updated'
    | 'check:due'
    | 'check:completed'
    | 'check:waiting'
    | 'energy:popup'
    | 'interaction:list'
    | 'sync:session'
    | 'pong';
  payload: unknown;
  eventId?: string;
}

export function isValidDurationMinutes(
  m: number,
): m is BanDurationMinutes {
  return (BAN_DURATIONS_MINUTES as readonly number[]).includes(m);
}

/** @deprecated */
export function isValidDuration(m: number): m is BanDurationMinutes {
  return isValidDurationMinutes(m);
}
