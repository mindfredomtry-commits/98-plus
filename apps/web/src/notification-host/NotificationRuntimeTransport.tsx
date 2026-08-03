/**
 * Stage 8 Phase 9 — Transport cutover to Sync V1 Mapper.
 * HTTP GET /notifications/sync + WS notifications:delta:v1.
 * No Ban/session/pending item authority. No synthetic sequence/revision.
 */
'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { decideReconnectRecoveryRequest } from '@/notification-runtime/notification-runtime.reconnect-recovery';
import { useNotificationRuntimeStore } from '@/notification-runtime/notification-runtime.context';
import type { NotificationRuntimePortHandle } from '@/app-coordinator/notification-runtime-port';
import {
  applyNotificationsDeltaToStore,
  isNotificationsDeltaV1Event,
  parseNotificationsDeltaV1,
  runNotificationsSyncViaMapper,
} from '@/notification-runtime/notifications-mapper';

export type NotificationTransportAuth = {
  token: string | null;
  userId: string | null;
  runtimePort?: NotificationRuntimePortHandle | null;
};

/**
 * Mount once under NotificationRuntimeProvider.
 * Owns Sync bootstrap/recovery and live Delta V1 ingestion.
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
  const syncGenerationRef = useRef(0);

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
      const generation = ++syncGenerationRef.current;
      try {
        const recovery = reason === 'reconnect';
        const result = await runNotificationsSyncViaMapper(store, {
          token: tok,
          recovery,
          afterRevision: recovery ? store.getState().revision : null,
        });
        if (generation !== syncGenerationRef.current) {
          // Stale HTTP generation — ignore further side effects
          return;
        }
        if (
          tokenRef.current !== tok ||
          userIdRef.current !== uid
        ) {
          return;
        }
        void result;
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
    (event: { type: string; payload: unknown }) => {
      if (!isNotificationsDeltaV1Event(event.type)) {
        // Legacy ban:/check:/sync:session must not write Runtime items.
        return;
      }
      const delta = parseNotificationsDeltaV1(event.payload);
      if (!delta) return;
      applyNotificationsDeltaToStore(store, {
        delta,
        source: 'ws',
      });
    },
    [store],
  );

  const onReconnect = useCallback(() => {
    void runBootstrap('reconnect');
  }, [runBootstrap]);

  useWebSocket(token, onWsEvent, onReconnect);

  useEffect(() => {
    const api = {
      refresh: (reason: 'bootstrap' | 'reconnect' | 'user' = 'user') =>
        runBootstrap(reason === 'user' ? 'user' : reason),
      /** Pending refresh removed — Sync V1 only. */
      pendingRefresh: () => {
        /* no-op: journal Sync is sole authority */
      },
    };
    (
      globalThis as unknown as {
        __directNotificationTransport?: typeof api;
      }
    ).__directNotificationTransport = api;
    return () => {
      delete (
        globalThis as unknown as {
          __directNotificationTransport?: typeof api;
        }
      ).__directNotificationTransport;
    };
  }, [runBootstrap]);

  // REQUEST_FULL_SYNC effect sink — listen via store subscription
  useEffect(() => {
    return store.subscribe(() => {
      /* effects handled by controller/effects layer */
    });
  }, [store]);

  return null;
}
