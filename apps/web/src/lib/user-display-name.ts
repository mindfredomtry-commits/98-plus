import type { UserPublic } from '@98plus/shared';

/**
 * Display-name rule for the Profile header (in priority order):
 *   1. first_name + last_name
 *   2. first_name
 *   3. username
 *   4. «Пользователь 98+»
 */
export function resolveUserDisplayName(
  user: Pick<UserPublic, 'firstName' | 'lastName' | 'username'> | null | undefined,
): string {
  if (!user) return 'Пользователь 98+';
  const first = user.firstName?.trim() ?? '';
  const last = user.lastName?.trim() ?? '';
  if (first && last) return `${first} ${last}`;
  if (first) return first;
  const username = user.username?.trim();
  if (username) return username.startsWith('@') ? username : `@${username}`;
  return 'Пользователь 98+';
}

/** Single uppercase letter for the avatar placeholder. */
export function resolveAvatarLetter(
  user: Pick<UserPublic, 'firstName' | 'username'> | null | undefined,
): string {
  const source = user?.firstName?.trim() || user?.username?.replace(/^@/, '').trim();
  return (source?.[0] ?? '9').toUpperCase();
}
