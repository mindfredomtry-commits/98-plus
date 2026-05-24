'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { UserPublic, BanInteraction } from '@98plus/shared';
import {
  isInviteTokenStartParam,
  parseStartParam,
} from '@98plus/shared';
import { isValidIncomingOverlayPayload } from '@/lib/incoming-challenge';
import { challengeLog } from '@/lib/challenge-log';
import { api, ApiError, NetworkError } from '@/lib/api';
import {
  getApiUrl,
  isApiConfiguredForProduction,
  isClientDevAuthEnabled,
} from '@/lib/config';
import { useTelegram } from './useTelegram';

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
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [boot, setBoot] = useState<AuthBoot | null>(null);

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
      const key = tokenStorageKey(tgId ?? Number(res.user.telegramId));
      localStorage.setItem(key, res.token);
      localStorage.removeItem(TOKEN_KEY_LEGACY);
      setToken(res.token);
      setUser(res.user);
      setBoot({
        claimedIncoming: res.claimedIncoming ?? null,
        viralOnboarding: !!res.viralOnboarding,
        needsOnboardingRecovery: !!res.needsOnboardingRecovery,
      });
      setError(null);
    },
    [],
  );

  const login = useCallback(async () => {
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
        res = await api('/auth/telegram', {
          method: 'POST',
          body: JSON.stringify({
            initData,
            startParam: startParam ?? undefined,
          }),
        });
        persistSession(res, telegramId ?? tgUser?.id);
      } else if (isClientDevAuthEnabled()) {
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
        setError('Открой через Telegram');
        setLoading(false);
        return;
      }
    } catch (e) {
      setError(formatAuthError(e));
    } finally {
      setLoading(false);
    }
  }, [initData, tgUser, startParam, telegramId, persistSession]);

  const authRan = useRef(false);

  useEffect(() => {
    if (!ready || authRan.current) return;
    authRan.current = true;

    const inviteOpen = isInviteTokenStartParam(startParam);
    const action = parseStartParam(startParam);
    const inviteToken =
      action?.type === 'invite_token' ? action.token : null;

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
        await login();
        return;
      }

      const storageKey = tokenStorageKey(telegramId ?? tgUser?.id);
      const saved =
        localStorage.getItem(storageKey) ??
        localStorage.getItem(TOKEN_KEY_LEGACY);

      if (saved) {
        setToken(saved);
        try {
          const r = await api<{ user: UserPublic }>('/users/me', {
            token: saved,
          });
          setUser(r.user);

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
            const incoming = isValidIncomingOverlayPayload(claim.incoming)
              ? claim.incoming
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
          setLoading(false);
        }
        return;
      }

      await login();
    };

    run().catch(() => setLoading(false));
  }, [ready, login, initData, startParam, telegramId, tgUser?.id]);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    const r = await api<{ user: UserPublic }>('/users/me', { token });
    setUser(r.user);
  }, [token]);

  const onboard = useCallback(async () => {
    if (!token) return;
    await api('/users/onboard', { method: 'POST', token });
    await refreshUser();
  }, [token, refreshUser]);

  const clearBoot = useCallback(() => setBoot(null), []);

  return {
    token,
    user,
    loading,
    error,
    refreshUser,
    onboard,
    boot,
    clearBoot,
  };
}
