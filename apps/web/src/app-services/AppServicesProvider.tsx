/**
 * Phase 0 — non-notification App Services root.
 * Auth / product shell only. Does NOT own notification queue, display, or transport.
 */
'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { UserPublic } from '@98plus/shared';
import { useAuth } from '@/hooks/useAuth';
import { NotificationRuntimeProvider } from '@/notification-runtime/NotificationRuntimeProvider';
import { DirectNotificationHost } from '@/notification-host/DirectNotificationHost';
import { NotificationRuntimeTransport } from '@/notification-host/NotificationRuntimeTransport';

export type AppServicesValue = {
  token: string | null;
  user: UserPublic | null;
  loading: boolean;
  error: string | null;
  authReady: boolean;
  refreshUser: () => Promise<void>;
  onboard: () => Promise<void>;
  /** Product: open send/WHO flow (non-notification). */
  openSendFlow: () => void;
  /** Product: open bans section. */
  openBansSection: () => void;
  sendFlowRequested: number;
  bansSectionRequested: number;
};

const AppServicesContext = createContext<AppServicesValue | null>(null);

export function useAppServices(): AppServicesValue {
  const ctx = useContext(AppServicesContext);
  if (!ctx) {
    throw new Error('useAppServices requires AppServicesProvider');
  }
  return ctx;
}

/** Optional for pages that may render before provider in tests. */
export function useAppServicesOptional(): AppServicesValue | null {
  return useContext(AppServicesContext);
}

export function AppServicesProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [sendFlowRequested, setSendFlowRequested] = useState(0);
  const [bansSectionRequested, setBansSectionRequested] = useState(0);

  const openSendFlow = useCallback(() => {
    setSendFlowRequested((n) => n + 1);
  }, []);

  const openBansSection = useCallback(() => {
    setBansSectionRequested((n) => n + 1);
  }, []);

  const value = useMemo<AppServicesValue>(
    () => ({
      token: auth.token,
      user: auth.user,
      loading: auth.loading,
      error: auth.error,
      authReady: auth.authReady,
      refreshUser: auth.refreshUser,
      onboard: auth.onboard,
      openSendFlow,
      openBansSection,
      sendFlowRequested,
      bansSectionRequested,
    }),
    [
      auth.token,
      auth.user,
      auth.loading,
      auth.error,
      auth.authReady,
      auth.refreshUser,
      auth.onboard,
      openSendFlow,
      openBansSection,
      sendFlowRequested,
      bansSectionRequested,
    ],
  );

  const getToken = useCallback(() => auth.token, [auth.token]);

  return (
    <AppServicesContext.Provider value={value}>
      <NotificationRuntimeProvider>
        <NotificationRuntimeTransport
          token={auth.token}
          userId={auth.user?.id ?? null}
          notificationMode="real-time"
        />
        <DirectNotificationHost
          viewerId={auth.user?.id ?? null}
          getToken={getToken}
          lobbyBootIntroPrimed={!auth.loading}
          hostBlocksCta={false}
          influencePercent={auth.user?.energyPercent ?? 0}
          onStartBan={openSendFlow}
          onOpenBans={() => openBansSection()}
          onReply={() => {
            // Compose handoff reserved for later product wiring.
            openSendFlow();
          }}
        />
        {children}
      </NotificationRuntimeProvider>
    </AppServicesContext.Provider>
  );
}
