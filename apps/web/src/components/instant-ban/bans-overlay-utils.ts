import type { BanInteraction, UserPublic } from '@98plus/shared';

export type BansTab = 'yours' | 'toYou' | 'history' | 'archive';

export function userDisplayLetter(user: UserPublic | null | undefined): string {
  return (
    user?.firstName?.[0] ??
    user?.username?.[0] ??
    '?'
  ).toUpperCase();
}

export function userDisplayName(user: UserPublic | null | undefined): string {
  return user?.firstName || user?.username || '—';
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

export function filterBansForTab(
  bans: BanInteraction[],
  tab: BansTab,
  userId: string | undefined,
): BanInteraction[] {
  if (!userId) return [];
  switch (tab) {
    case 'yours':
      return bans.filter((b) => b.sender?.id === userId);
    case 'toYou':
      return bans.filter((b) => b.receiver?.id === userId);
    case 'history':
    case 'archive':
      return [];
    default:
      return bans;
  }
}

export function opponentForBan(
  ban: BanInteraction,
  userId: string | undefined,
): UserPublic {
  if (userId && ban.sender?.id === userId) {
    return ban.receiver;
  }
  return ban.sender;
}
