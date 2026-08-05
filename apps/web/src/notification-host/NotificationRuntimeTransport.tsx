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
import {
  logNotificationsSyncDiag,
  nextNotificationsSyncCorrelationId,
} from '@/notification-runtime/notifications-sync-diag';

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
      const correlationId = nextNotificationsSyncCorrelationId(reason);
      try {
        const recovery = reason === 'reconnect';
        // Full snapshot when user/effect requested recovery from REVISION_GAP.
        const forceFullSnapshot = reason === 'user';
        const result = await runNotificationsSyncViaMapper(store, {
          token: tok,
          recovery: recovery && !forceFullSnapshot,
          afterRevision: forceFullSnapshot
            ? null
            : recovery
              ? store.getState().revision
              : null,
          correlationId,
        });
        if (generation !== syncGenerationRef.current) {
          return;
        }
        if (tokenRef.current !== tok || userIdRef.current !== uid) {
          return;
        }
        const st = store.getState();
        logNotificationsSyncDiag(correlationId, 'AVAILABILITY', {
          syncStatus: st.syncStatus,
          revision: st.revision,
          passiveItemIds: [...st.passiveItemIds],
          ok: result.ok,
          errorCode: result.errorCode ?? null,
        });
      } finally {
        bootInFlightRef.current = false;
        // First sync completion leaves BOOT — including user-triggered full
        // snapshot kicked by WS REVISION_GAP before the bootstrap effect runs.
        if (!coldBootSettledRef.current) {
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
    logNotificationsSyncDiag(
      nextNotificationsSyncCorrelationId('mount'),
      'RUNTIME_STORE_CREATED',
      { hasToken: Boolean(token), hasUserId: Boolean(userId) },
    );
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
      const correlationId = nextNotificationsSyncCorrelationId('ws');
      applyNotificationsDeltaToStore(store, {
        delta,
        source: 'websocket',
        correlationId,
      });
      const effects = store.getLastEffects();
      const needsFullSync = effects.some((e) => e.type === 'REQUEST_FULL_SYNC');
      if (needsFullSync) {
        logNotificationsSyncDiag(correlationId, 'REQUEST_FULL_SYNC', {
          reason: effects.find((e) => e.type === 'REQUEST_FULL_SYNC')
            ? (
                effects.find((e) => e.type === 'REQUEST_FULL_SYNC') as {
                  reason: string;
                }
              ).reason
            : 'unknown',
          revision: store.getState().revision,
          syncStatus: store.getState().syncStatus,
        });
        // Full snapshot — do not use afterRevision recovery.
        void runBootstrap('user');
      }
    },
    [store, runBootstrap],
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

  return null;
}
