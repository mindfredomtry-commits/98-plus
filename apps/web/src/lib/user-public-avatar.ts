import type { BanInteraction, UserPublic } from '@98plus/shared';
import { rememberUserAvatar, resolveUserAvatarUrl } from './avatar-cache';
import { normalizeBanInteraction, normalizeUserPublic } from './normalize-json';

/** Display URL for any user payload (session, bans, profile). */
export function userAvatarSrc(
  user: UserPublic | null | undefined,
): string | null {
  return resolveUserAvatarUrl(user);
}

/** Merge API user with in-memory avatar cache (no downgrade to null). */
export function enrichUserPublic(user: UserPublic): UserPublic {
  const normalized = normalizeUserPublic(user);
  rememberUserAvatar(
    normalized.id,
    normalized.avatarUrl ?? normalized.photoUrl,
  );
  const url = resolveUserAvatarUrl(normalized);
  if (!url) return normalized;
  return { ...normalized, avatarUrl: url, photoUrl: url };
}

export function enrichBanInteraction(ban: BanInteraction): BanInteraction {
  const normalized = normalizeBanInteraction(ban);
  return {
    ...normalized,
    sender: enrichUserPublic(normalized.sender),
    receiver: enrichUserPublic(normalized.receiver),
  };
}
