/**
 * App Services root — auth + one coordinator lifecycle under Runtime provider.
 * Coordinator is the sole global surface owner.
 */
'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { UserPublic } from '@98plus/shared';
import { useAuth } from '@/hooks/useAuth';
import { useTelegram } from '@/hooks/useTelegram';
import { ApplicationSurface } from '@/app-coordinator/ApplicationSurface';
import {
  createAppCoordinatorLifecycle,
  routeLaunchEntry,
  type AppCoordinatorLifecycle,
} from '@/app-coordinator/app-coordinator.lifecycle';
import { NotificationRuntimeProvider } from '@/notification-runtime/NotificationRuntimeProvider';
import { useNotificationRuntimeStore } from '@/notification-runtime/notification-runtime.context';
import { NotificationRuntimeTransport } from '@/notification-host/NotificationRuntimeTransport';

export type AppServicesValue = {
  token: string | null;
  user: UserPublic | null;
  loading: boolean;
  error: string | null;
  authReady: boolean;
  refreshUser: () => Promise<void>;
  onboard: () => Promise<void>;
};

const AppServicesContext = createContext<AppServicesValue | null>(null);

export function useAppServices(): AppServicesValue {
  const ctx = useContext(AppServicesContext);
  if (!ctx) {
    throw new Error('useAppServices requires AppServicesProvider');
  }
  return ctx;
}

export function useAppServicesOptional(): AppServicesValue | null {
  return useContext(AppServicesContext);
}

function AppCoordinatorComposition({
  token,
  user,
  loading,
  authReady,
  onboard,
  refreshUser,
  startParam,
}: {
  token: string | null;
  user: UserPublic | null;
  loading: boolean;
  authReady: boolean;
  onboard: () => Promise<void>;
  refreshUser: () => Promise<void>;
  startParam: string | null;
}) {
  const runtimeStore = useNotificationRuntimeStore();
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const getToken = useCallback(() => tokenRef.current, []);
  const lifecycleRef = useRef<AppCoordinatorLifecycle | null>(null);
  const [lifecycle, setLifecycle] = useState<AppCoordinatorLifecycle | null>(
    null,
  );
  const entryRoutedRef = useRef(false);

  useEffect(() => {
    const next = createAppCoordinatorLifecycle({
      runtimeStore,
      getToken,
      onboard,
      refreshUser,
    });
    lifecycleRef.current = next;
    setLifecycle(next);
    return () => {
      next.dispose();
      if (lifecycleRef.current === next) {
        lifecycleRef.current = null;
      }
      setLifecycle(null);
    };
    // One lifecycle per Runtime store identity — not per token change.
  }, [runtimeStore, getToken, onboard, refreshUser]);

  // Boot completion is Runtime-driven once a session exists.
  // Without a session, leave BOOTING only until auth settles to no-token.
  useEffect(() => {
    if (!lifecycle || loading) return;
    if (!token && !authReady) {
      lifecycle.runtimePort.notifyBootCompleted();
    }
  }, [authReady, lifecycle, loading, token]);

  useEffect(() => {
    if (!lifecycle || !authReady || entryRoutedRef.current) return;
    entryRoutedRef.current = true;
    routeLaunchEntry(lifecycle, {
      startParam,
      launchSource: 'telegram',
    });
  }, [authReady, lifecycle, startParam]);

  return (
    <>
      {lifecycle ? (
        <NotificationRuntimeTransport
          token={token}
          userId={user?.id ?? null}
          runtimePort={lifecycle.runtimePort}
        />
      ) : null}
      <ApplicationSurface
        lifecycle={lifecycle}
        loading={loading}
        user={user}
        getToken={getToken}
      />
    </>
  );
}

export function AppServicesProvider() {
  const auth = useAuth();
  const { startParam } = useTelegram();

  const value = useMemo<AppServicesValue>(
    () => ({
      token: auth.token,
      user: auth.user,
      loading: auth.loading,
      error: auth.error,
      authReady: auth.authReady,
      refreshUser: auth.refreshUser,
      onboard: auth.onboard,
    }),
    [
      auth.token,
      auth.user,
      auth.loading,
      auth.error,
      auth.authReady,
      auth.refreshUser,
      auth.onboard,
    ],
  );

  return (
    <AppServicesContext.Provider value={value}>
      <NotificationRuntimeProvider>
        <AppCoordinatorComposition
          token={auth.token}
          user={auth.user}
          loading={auth.loading}
          authReady={auth.authReady}
          onboard={auth.onboard}
          refreshUser={auth.refreshUser}
          startParam={startParam ?? null}
        />
      </NotificationRuntimeProvider>
    </AppServicesContext.Provider>
  );
}
