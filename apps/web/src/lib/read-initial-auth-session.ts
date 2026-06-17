import type { UserPublic } from '@98plus/shared';
import { readAuthProfileCache } from '@/lib/auth-profile-cache';
import { enrichUserPublic } from '@/lib/user-public-avatar';

const TOKEN_KEY_LEGACY = '98plus_token';

function tokenStorageKey(telegramId: number): string {
  return `98plus_token_${telegramId}`;
}

export type InitialAuthSession = {
  token: string | null;
  user: UserPublic | null;
  loading: boolean;
};

/** Sync session for first paint — avoids BootLobby flash on repeat opens. */
export function readInitialAuthSession(): InitialAuthSession {
  if (typeof window === 'undefined') {
    return { token: null, user: null, loading: true };
  }

  const tgId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  if (tgId == null) {
    return { token: null, user: null, loading: true };
  }

  const token =
    localStorage.getItem(tokenStorageKey(tgId)) ??
    localStorage.getItem(TOKEN_KEY_LEGACY);
  const cached = readAuthProfileCache(tgId);

  if (token && cached?.id) {
    return {
      token,
      user: enrichUserPublic(cached),
      loading: false,
    };
  }

  return { token: token ?? null, user: null, loading: true };
}
