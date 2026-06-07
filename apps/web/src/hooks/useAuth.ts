'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { UserPublic, BanInteraction } from '@98plus/shared';
import {
  isInviteTokenStartParam,
  parseStartParam,
} from '@98plus/shared';
import { shouldShowIncomingBanModal } from '@/lib/incoming-challenge';
import { challengeLog } from '@/lib/challenge-log';
import { api, ApiError, NetworkError } from '@/lib/api';
import {
  getApiUrl,
  isApiConfiguredForProduction,
  isClientDevAuthEnabled,
} from '@/lib/config';
import { useTelegram } from './useTelegram';
import { logAuthTiming } from '@/lib/boot-timing';
import {
  enrichBanInteraction,
  enrichUserPublic,
} from '@/lib/user-public-avatar';
import {
  readAuthProfileCache,
  writeAuthProfileCache,
} from '@/lib/auth-profile-cache';
import { readInitialAuthSession } from '@/lib/read-initial-auth-session';

const TOKEN_KEY_LEGACY = '98plus_token';

function tokenStorageKey(telegramId?: number | null): string {
  if (telegramId == null) return TOKEN_KEY_LEGACY;
  return `98plus_token_${telegramId}`;
}

function clearAllStoredTokens() {
  if (typeof localStorage === 'undefined') return;
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith('98plus_token')) keys.push(k);
  }
  keys.forEach((k) => localStorage.removeItem(k));
}

export interface AuthBoot {
  claimedIncoming: BanInteraction | null;
  viralOnboarding: boolean;
  needsOnboardingRecovery: boolean;
}

export function useAuth() {
  const { initData, ready, user: tgUser, startParam, telegramId } =
    useTelegram();
  const [initialSession] = useState(readInitialAuthSession);
  const [token, setToken] = useState<string | null>(initialSession.token);
  const [user, setUser] = useState<UserPublic | null>(initialSession.user);
  const [loading, setLoading] = useState(initialSession.loading);
  const [error, setError] = useState<string | null>(null);
  const [boot, setBoot] = useState<AuthBoot | null>(null);

  // Used to discard in-flight auth/session results when Telegram user changes.
  const identityRef = useRef<number | null>(null);
  const lastAuthIdentityRef = useRef<number | null>(null);

  const formatAuthError = (e: unknown): string => {
    if (e instanceof NetworkError) {
      return `Нет связи с API:\n${e.url}`;
    }
    if (e instanceof ApiError) {
      return `${e.message} (${e.status})`;
    }
    if (e instanceof Error) return e.message;
    return 'Unknown error';
  };

  const persistSession = useCallback(
    (
      res: {
        token: string;
        user: UserPublic;
        claimedIncoming?: BanInteraction | null;
        viralOnboarding?: boolean;
        needsOnboardingRecovery?: boolean;
      },
      tgId?: number | null,
    ) => {
      const thisTgId = tgId ?? Number(res.user.telegramId);
      if (identityRef.current != null && thisTgId !== identityRef.current) {
        return;
      }
      if (String(res.user.telegramId) !== String(thisTgId)) {
        return;
      }

      const key = tokenStorageKey(tgId ?? Number(res.user.telegramId));
      localStorage.setItem(key, res.token);
      localStorage.removeItem(TOKEN_KEY_LEGACY);
      setToken(res.token);
      setUser(enrichUserPublic(res.user));
      writeAuthProfileCache(res.user);
      logAuthTiming('auth-user-set', {
        userId: res.user.id,
        telegramId: res.user.telegramId,
      });
      setBoot({
        claimedIncoming: res.claimedIncoming
          ? enrichBanInteraction(res.claimedIncoming)
          : null,
        viralOnboarding: !!res.viralOnboarding,
        needsOnboardingRecovery: !!res.needsOnboardingRecovery,
      });
      setError(null);
    },
    [],
  );

  const login = useCallback(async () => {
    const requestIdentity = identityRef.current;
    logAuthTiming('auth-login-start', {
      hasInitData: !!initData,
      telegramId: telegramId ?? tgUser?.id ?? null,
    });
    if (!isApiConfiguredForProduction()) {
      const apiUrl = getApiUrl();
      setError(
        `API не настроен (${apiUrl}). Задай NEXT_PUBLIC_API_URL при запуске web или открой с ?api_url=https://твой-backend-tunnel`,
      );
      setLoading(false);
      return;
    }

    try {
      let res: {
        token: string;
        user: UserPublic;
        claimedIncoming?: BanInteraction | null;
        viralOnboarding?: boolean;
        needsOnboardingRecovery?: boolean;
      };

      if (initData) {
        if (typeof window !== 'undefined') {
          console.log('[TG AUTH DEBUG]', {
            hasTelegram: !!window.Telegram,
            hasWebApp: !!window.Telegram?.WebApp,
            initDataLength: window.Telegram?.WebApp?.initData?.length ?? 0,
            platform: window.Telegram?.WebApp?.platform,
            startParam: window.Telegram?.WebApp?.initDataUnsafe?.start_param,
          });
        }
        try {
          res = await api('/auth/telegram', {
            method: 'POST',
            body: JSON.stringify({
              initData,
              startParam: startParam ?? undefined,
            }),
          });
          console.log('[TG AUTH DEBUG] /auth/telegram response', {
            ok: true,
            userId: res.user?.id ?? null,
            telegramId: res.user?.telegramId ?? null,
          });
        } catch (authErr) {
          console.log('[TG AUTH DEBUG] /auth/telegram failed', {
            kind:
              authErr instanceof NetworkError
                ? 'network'
                : authErr instanceof ApiError
                  ? 'api'
                  : 'unknown',
            status: authErr instanceof ApiError ? authErr.status : null,
            url:
              authErr instanceof NetworkError
                ? authErr.url
                : authErr instanceof ApiError
                  ? authErr.url
                  : null,
            message:
              authErr instanceof Error ? authErr.message : String(authErr),
          });
          throw authErr;
        }
        persistSession(res, telegramId ?? tgUser?.id);
      } else if (isClientDevAuthEnabled()) {
        if (typeof window !== 'undefined') {
          console.log('[TG AUTH DEBUG]', {
            hasTelegram: !!window.Telegram,
            hasWebApp: !!window.Telegram?.WebApp,
            initDataLength: window.Telegram?.WebApp?.initData?.length ?? 0,
            platform: window.Telegram?.WebApp?.platform,
            startParam: window.Telegram?.WebApp?.initDataUnsafe?.start_param,
            initDataFromHook: initData.length,
          });
        }
        res = await api('/auth/dev', {
          method: 'POST',
          body: JSON.stringify({
            telegramId: tgUser?.id ?? 100000001,
            firstName: tgUser?.first_name ?? 'Dev',
            username: tgUser?.username ?? 'dev_user',
            startParam: startParam ?? undefined,
          }),
        });
        persistSession(res, tgUser?.id ?? 100000001);
      } else {
        if (typeof window !== 'undefined') {
          console.log('[TG AUTH DEBUG]', {
            hasTelegram: !!window.Telegram,
            hasWebApp: !!window.Telegram?.WebApp,
            initDataLength: window.Telegram?.WebApp?.initData?.length ?? 0,
            platform: window.Telegram?.WebApp?.platform,
            startParam: window.Telegram?.WebApp?.initDataUnsafe?.start_param,
            initDataFromHook: initData.length,
          });
        }
        setError('Открой через Telegram');
        setLoading(false);
        return;
      }
    } catch (e) {
      if (identityRef.current === requestIdentity) {
        setError(formatAuthError(e));
      }
    } finally {
      if (identityRef.current === requestIdentity) {
        setLoading(false);
        logAuthTiming('auth-loading-false', {
          via: 'login',
        });
      }
    }
  }, [initData, tgUser, startParam, telegramId, persistSession]);

  useEffect(() => {
    if (!ready) return;

    const identity = telegramId ?? tgUser?.id ?? null;
    const inviteOpen = isInviteTokenStartParam(startParam);
    const identityChanged = lastAuthIdentityRef.current !== identity;

    // If Telegram user is the same and we already have auth loaded, avoid re-clearing UI.
    if (!identityChanged && !inviteOpen && token && user) return;

    lastAuthIdentityRef.current = identity;
    identityRef.current = identity;

    const warmSession = !!(token && user) && !inviteOpen;

    if (!warmSession) {
      setLoading(true);
      setError(null);
      setToken(null);
      setUser(null);
      setBoot(null);
    } else {
      setLoading(false);
      setError(null);
    }

    const action = parseStartParam(startParam);
    const inviteToken =
      action?.type === 'invite_token' ? action.token : null;

    const requestIdentity = identity;

    const run = async () => {
      // Invite deep link: never reuse a cached JWT — auth must be current Telegram user only
      if (inviteOpen) {
        clearAllStoredTokens();
        setToken(null);
        setUser(null);
        setBoot(null);
        await login();
        return;
      }

      // Telegram Mini App: always bind session to signed initData (current user)
      if (initData) {
        const tgId = telegramId ?? tgUser?.id ?? null;
        const cachedProfile = tgId != null ? readAuthProfileCache(tgId) : null;
        if (cachedProfile?.id) {
          const saved =
            localStorage.getItem(tokenStorageKey(tgId)) ??
            localStorage.getItem(TOKEN_KEY_LEGACY);
          if (saved) setToken(saved);
          setUser(enrichUserPublic(cachedProfile));
          setLoading(false);
          logAuthTiming('auth-user-set', {
            userId: cachedProfile.id,
            telegramId: cachedProfile.telegramId,
            via: 'profile-cache-initData',
          });
        }
        await login();
        return;
      }

      const storageKey = tokenStorageKey(telegramId ?? tgUser?.id);
      const saved =
        localStorage.getItem(storageKey) ??
        (requestIdentity == null ? localStorage.getItem(TOKEN_KEY_LEGACY) : null);

      if (saved) {
        if (identityRef.current !== requestIdentity) return;
        setToken(saved);
        const tgId = telegramId ?? tgUser?.id ?? null;
        const cachedProfile = tgId != null ? readAuthProfileCache(tgId) : null;
        if (cachedProfile?.id) {
          setUser(enrichUserPublic(cachedProfile));
          setLoading(false);
          logAuthTiming('auth-user-set', {
            userId: cachedProfile.id,
            telegramId: cachedProfile.telegramId,
            via: 'profile-cache',
          });
        }
        try {
          const r = await api<{ user: UserPublic }>('/users/me', {
            token: saved,
          });
          if (identityRef.current !== requestIdentity) return;
          setUser(enrichUserPublic(r.user));
          writeAuthProfileCache(r.user);
          logAuthTiming('auth-user-set', {
            userId: r.user.id,
            telegramId: r.user.telegramId,
            via: 'users/me',
          });

          if (inviteToken) {
            const claim = await api<{
              incoming: BanInteraction;
              needsOnboardingRecovery?: boolean;
              viralOnboarding?: boolean;
            }>('/invites/claim', {
              method: 'POST',
              token: saved,
              body: JSON.stringify({ token: inviteToken }),
            });
            if (identityRef.current !== requestIdentity) return;
            const claimed = enrichBanInteraction(claim.incoming);
            const incoming = shouldShowIncomingBanModal(
              claimed,
              r.user.id,
              new Set(),
            )
              ? claimed
              : null;
            challengeLog('boot:invite-claim', {
              banId: claim.incoming?.id ?? null,
              valid: !!incoming,
            });
            setBoot({
              claimedIncoming: incoming,
              viralOnboarding: !!incoming,
              needsOnboardingRecovery: !!incoming,
            });
          }
        } catch {
          localStorage.removeItem(storageKey);
          localStorage.removeItem(TOKEN_KEY_LEGACY);
          await login();
        } finally {
          if (identityRef.current === requestIdentity) {
            setLoading(false);
            logAuthTiming('auth-loading-false', { via: 'saved-token' });
          }
        }
        return;
      }

      await login();
    };

    run().catch(() => {
      if (identityRef.current === requestIdentity) setLoading(false);
    });
  }, [
    ready,
    login,
    initData,
    startParam,
    telegramId,
    tgUser?.id,
    token,
    user,
  ]);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    const r = await api<{ user: UserPublic }>('/users/me', { token });
    const enriched = enrichUserPublic(r.user);
    setUser(enriched);
    writeAuthProfileCache(enriched);
  }, [token]);

  const onboard = useCallback(async () => {
    if (!token) return;
    await api('/users/onboard', { method: 'POST', token });
    await refreshUser();
  }, [token, refreshUser]);

  const clearBoot = useCallback(() => setBoot(null), []);

  const telegramIdStr =
    telegramId != null ? String(telegramId) : tgUser?.id != null ? String(tgUser.id) : null;

  // If we authenticated using Telegram initData, the backend token is already bound
  // to the current Telegram user, so we don't need to wait for telegramIdStr match.
  const boundByInitData = initData.trim().length > 0;

  const authReady =
    !loading &&
    !!token &&
    !!user &&
    (boundByInitData ||
      (!!telegramIdStr && String(user.telegramId) === telegramIdStr));

  useEffect(() => {
    logAuthTiming('auth-state', {
      telegramId,
      authReady,
      loading,
      tokenPresent: !!token,
      userId: user?.id ?? null,
      userTelegramId: user?.telegramId ?? null,
      boundByInitData: initData.trim().length > 0,
    });
  }, [authReady, loading, telegramId, token, user?.id, user?.telegramId, initData]);

  return {
    token,
    user,
    loading,
    authReady,
    error,
    refreshUser,
    onboard,
    boot,
    clearBoot,
  };
}
