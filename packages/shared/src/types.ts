import type { AuraLevel } from './energy';
import type { NotificationMode } from './notification-mode';
import type { BanDurationMinutes } from './constants';
import type { InteractionOutcome } from './result';
import {
  BAN_DURATIONS_MINUTES,
  INSTANT_BAN_DURATION_MAX_MINUTES,
  INSTANT_BAN_DURATION_MIN_MINUTES,
  ONBOARDING_DURATION_OPTIONS,
} from './constants';

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
  /** Canonical avatar URL (same value as photoUrl for API compatibility). */
  avatarUrl: string | null;
  /** @deprecated use avatarUrl */
  photoUrl: string | null;
  aura: AuraLevel;
  auraLabel: string;
  energyPercent: number;
  streak: number;
  isOnboarded: boolean;
  /** Live notification display preference — synced across devices. */
  notificationMode: NotificationMode;
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
  /** Receiver dismissed the incoming notification modal (server ack). */
  incomingAcknowledged?: boolean;
  /** Terminal check/result outcome — populated for history list items. */
  outcome?: InteractionOutcome | null;
  /** Pair exceeded daily ban cap — energy-free for this interaction. */
  funMode?: boolean;
  isFunMode?: boolean;
  economyMode?: 'normal' | 'fun';
  /** Bans between pair in rolling day window (for optimistic UI). */
  pairBanCount24h?: number | null;
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
  /** Authenticated user this session belongs to (used for frontend isolation). */
  userId?: string;
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

/** Instant-ban send: any whole minute from 3 to 60 (WhatDurationSlider). */
export function isInstantBanDurationMinutes(m: number): boolean {
  return (
    Number.isInteger(m) &&
    m >= INSTANT_BAN_DURATION_MIN_MINUTES &&
    m <= INSTANT_BAN_DURATION_MAX_MINUTES
  );
}

/** First-ban onboarding duration choices (hours/days). */
export function isOnboardingDurationMinutes(m: number): boolean {
  return (
    Number.isInteger(m) &&
    ONBOARDING_DURATION_OPTIONS.some((o) => o.minutes === m)
  );
}

export function isValidDurationMinutes(m: number): boolean {
  return isInstantBanDurationMinutes(m) || isOnboardingDurationMinutes(m);
}

export function isBanDurationMinutes(m: number): m is BanDurationMinutes {
  return (BAN_DURATIONS_MINUTES as readonly number[]).includes(m);
}

/** @deprecated */
export function isValidDuration(m: number): m is BanDurationMinutes {
  return isBanDurationMinutes(m);
}
