import {
  findFriendByUsername,
  formatHistoryOutcomeLabel,
  type BanInteraction,
  type BanStatus,
  type FriendCard,
} from '@98plus/shared';

export type BansTab = 'yours' | 'toYou' | 'history' | 'archive';

/** Receiver has not accepted yet — exclude from Твои / Тебе. */
export const BAN_PENDING_STATUS: BanStatus = 'pending';

/** Accepted, still running — shown in Твои / Тебе. */
export const BAN_IN_PROGRESS_STATUSES: readonly BanStatus[] = [
  'active',
  'checking',
] as const;

/** Finished bans — История only. */
export const BAN_TERMINAL_STATUSES: readonly BanStatus[] = [
  'completed',
  'expired',
  'failed',
  'overboard',
  'countered',
] as const;

export function isBanPending(ban: BanInteraction): boolean {
  return ban.status === BAN_PENDING_STATUS;
}

export function isBanTerminal(status: BanStatus): boolean {
  return (BAN_TERMINAL_STATUSES as readonly string[]).includes(status);
}

/** Accepted by receiver and not finished yet. */
export function isBanAcceptedInProgress(ban: BanInteraction): boolean {
  if (isBanPending(ban)) return false;
  if (isBanTerminal(ban.status)) return false;
  return true;
}

export function userDisplayLetter(user: BanInteraction['sender']): string {
  return (
    user?.firstName?.[0] ??
    user?.username?.[0] ??
    '?'
  ).toUpperCase();
}

export function userDisplayName(
  user: BanInteraction['sender'] | BanInteraction['receiver'],
): string {
  return user?.firstName || user?.username || '—';
}

/** Product outcome label for История — never "завершён". */
export function banHistoryStatusLabel(ban: BanInteraction): string {
  return formatHistoryOutcomeLabel(ban.outcome, ban.status);
}

export function banStatusLabel(status: BanInteraction['status']): string {
  switch (status) {
    case 'pending':
      return 'ожидает';
    case 'active':
      return 'запрещено';
    case 'checking':
      return 'проверка';
    case 'replied':
      return 'ответил';
    case 'countered':
      return 'в ответ';
    case 'completed':
      return 'завершён';
    case 'expired':
      return 'истёк';
    case 'failed':
      return 'не удался';
    case 'overboard':
      return 'перебор';
    default:
      return status;
  }
}

export function bansTabEmptyMessage(tab: BansTab): string {
  switch (tab) {
    case 'yours':
      return 'Нет принятых запретов, которые ты отправил.';
    case 'toYou':
      return 'Нет принятых запретов от других.';
    case 'history':
      return 'Завершённых запретов пока нет.';
    case 'archive':
      return 'Сохранённых запретов пока нет.';
    default:
      return 'Пока тихо.';
  }
}

export function filterBansForTab(
  activeBans: BanInteraction[],
  historyBans: BanInteraction[],
  savedBans: BanInteraction[],
  tab: BansTab,
  userId: string | undefined,
): BanInteraction[] {
  if (!userId) return [];

  switch (tab) {
    case 'yours':
      return activeBans.filter(
        (b) =>
          b.sender?.id === userId && isBanAcceptedInProgress(b),
      );
    case 'toYou':
      return activeBans.filter(
        (b) =>
          b.receiver?.id === userId && isBanAcceptedInProgress(b),
      );
    case 'history':
      // GET /bans/history already scopes by sender OR receiver + terminal status.
      return historyBans;
    case 'archive':
      return savedBans;
    default:
      return [];
  }
}

export function opponentForBan(
  ban: BanInteraction,
  userId: string | undefined,
): BanInteraction['sender'] {
  if (userId && ban.sender?.id === userId) {
    return ban.receiver;
  }
  return ban.sender;
}

/** Build send target from ban record — does not depend on friends cache. */
export function friendCardFromBanUser(
  opponent: BanInteraction['sender'],
): FriendCard {
  return {
    id: opponent.id,
    userId: opponent.id,
    telegramId: opponent.telegramId,
    username: opponent.username ?? '',
    firstName: opponent.firstName,
    photoUrl: opponent.photoUrl,
    avatarUrl: opponent.avatarUrl,
    auraLabel: opponent.auraLabel,
    streak: opponent.streak,
    energyPercent: opponent.energyPercent,
    presence: 'offline',
    lastSeenAt: null,
    interactionCount: 0,
    isRegistered: true,
  };
}

export type OpponentFriendSource = 'ban-record' | 'friends-cache';

export function resolveOpponentFriendCard(
  opponent: BanInteraction['sender'],
  friends: FriendCard[],
): { card: FriendCard; source: OpponentFriendSource } {
  const fromFriends = findFriendByUsername(friends, opponent.username ?? '');
  if (fromFriends) {
    return { card: fromFriends, source: 'friends-cache' };
  }
  return { card: friendCardFromBanUser(opponent), source: 'ban-record' };
}

/** @deprecated Prefer resolveOpponentFriendCard for repeat/archive flows. */
export function opponentToFriendCard(
  opponent: BanInteraction['sender'],
  friends: FriendCard[],
): FriendCard {
  return resolveOpponentFriendCard(opponent, friends).card;
}
