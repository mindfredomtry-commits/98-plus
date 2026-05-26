import type { BanInteraction, UserPublic } from '@98plus/shared';
import { rememberUserAvatar, resolveUserAvatarUrl } from './avatar-cache';

/** Display URL for any user payload (session, bans, profile). */
export function userAvatarSrc(
  user: UserPublic | null | undefined,
): string | null {
  return resolveUserAvatarUrl(user);
}

/** Merge API user with in-memory avatar cache (no downgrade to null). */
export function enrichUserPublic(user: UserPublic): UserPublic {
  rememberUserAvatar(user.id, user.avatarUrl ?? user.photoUrl);
  const url = resolveUserAvatarUrl(user);
  if (!url) return user;
  return { ...user, avatarUrl: url, photoUrl: url };
}

export function enrichBanInteraction(ban: BanInteraction): BanInteraction {
  return {
    ...ban,
    sender: enrichUserPublic(ban.sender),
    receiver: enrichUserPublic(ban.receiver),
  };
}
