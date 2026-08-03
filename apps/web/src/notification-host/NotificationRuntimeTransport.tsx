/**
 * Stage 8 correction — Transport must not write Notification items into Runtime.
 * Sync status only → FAILED AWAITING_TRUTHFUL_SYNC until Phase 9.
 */
'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import {
  completeBootstrap,
  failBootstrap,
  requestBootstrap,
} from '@/notification-runtime/notification-runtime.bootstrap';
import { decideReconnectRecoveryRequest } from '@/notification-runtime/notification-runtime.reconnect-recovery';
import { useNotificationRuntimeStore } from '@/notification-runtime/notification-runtime.context';
import type { NotificationRuntimePortHandle } from '@/app-coordinator/notification-runtime-port';

export type NotificationTransportAuth = {
  token: string | null;
  userId: string | null;
  runtimePort?: NotificationRuntimePortHandle | null;
};

/**
 * Mount once under NotificationRuntimeProvider.
 * Owns sync status transitions only — no item collection writes.
 */
export function NotificationRuntimeTransport({
  token,
  userId,
  runtimePort = null,
}: NotificationTransportAuth) {
  const store = useNotificationRuntimeStore();
  const tokenRef = useRef(token);
  const userIdRef = useRef(userId);
  const runtimePortRef = useRef(runtimePort);
  tokenRef.current = token;
  userIdRef.current = userId;
  runtimePortRef.current = runtimePort;
  const bootInFlightRef = useRef(false);
  const coldBootSettledRef = useRef(false);

  const runBootstrap = useCallback(
    async (reason: 'bootstrap' | 'reconnect' | 'user') => {
      const tok = tokenRef.current;
      const uid = userIdRef.current;
      if (!tok || !uid) return;
      if (bootInFlightRef.current && reason !== 'reconnect') return;

      if (reason === 'reconnect') {
        const decision = decideReconnectRecoveryRequest(store.getState());
        if (decision.action === 'coalesce') {
          return;
        }
        runtimePortRef.current?.notifyReconnectStarted();
      }

      bootInFlightRef.current = true;
      const bootReq = requestBootstrap(store, {
        source: 'bootstrap',
        recovery: reason === 'reconnect',
      });
      try {
        // Ban/session/pending payloads cannot supply journal sequence/revision.
        // Do not invent SNAPSHOT/DELTA. Mark sync failed until Phase 9.
        if (tokenRef.current !== tok || userIdRef.current !== uid) {
          failBootstrap(store, {
            transitionId: bootReq.transitionId,
            errorCode: 'AUTH_SWITCHED',
            source: 'bootstrap',
          });
          return;
        }
        completeBootstrap(store, {
          transitionId: bootReq.transitionId,
          source: 'bootstrap',
        });
      } catch {
        failBootstrap(store, {
          transitionId: bootReq.transitionId,
          errorCode: 'BOOTSTRAP_FAILED',
          source: 'bootstrap',
        });
      } finally {
        bootInFlightRef.current = false;
        if (reason === 'bootstrap' && !coldBootSettledRef.current) {
          coldBootSettledRef.current = true;
          runtimePortRef.current?.notifyBootCompleted();
        }
        if (reason === 'reconnect') {
          runtimePortRef.current?.notifyReconnectCompleted();
        }
      }
    },
    [store],
  );

  useEffect(() => {
    coldBootSettledRef.current = false;
    if (!token || !userId) return;
    void runBootstrap('bootstrap');
  }, [token, userId, runBootstrap]);

  const onWsEvent = useCallback(
    (_event: { type: string; payload: unknown }) => {
      // WS Ban events must not write Runtime items without journal Sync.
    },
    [],
  );

  const onReconnect = useCallback(() => {
    void runBootstrap('reconnect');
  }, [runBootstrap]);

  useWebSocket(token, onWsEvent, onReconnect);

  useEffect(() => {
    const api = {
      refresh: (reason: 'bootstrap' | 'reconnect' | 'user' = 'user') =>
        runBootstrap(reason === 'user' ? 'user' : reason),
      pendingRefresh: async () => {
        // No-op: pending payloads are not Runtime authority.
      },
    };
    (
      window as Window & {
        __directNotificationTransport?: typeof api;
      }
    ).__directNotificationTransport = api;
    return () => {
      delete (
        window as Window & {
          __directNotificationTransport?: typeof api;
        }
      ).__directNotificationTransport;
    };
  }, [runBootstrap]);

  return null;
}

export function requestDirectTransportRefresh(
  reason: 'bootstrap' | 'reconnect' | 'user' = 'user',
): Promise<void> {
  const api = (
    window as Window & {
      __directNotificationTransport?: {
        refresh: (r: 'bootstrap' | 'reconnect' | 'user') => Promise<void>;
      };
    }
  ).__directNotificationTransport;
  if (!api) return Promise.resolve();
  return api.refresh(reason);
}
