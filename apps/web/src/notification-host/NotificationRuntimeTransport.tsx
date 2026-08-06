/**
 * Stage 8 Phase 9 — Transport cutover to Sync V1 Mapper.
 * HTTP GET /notifications/sync + WS notifications:delta:v1.
 * No Ban/session/pending item authority. No synthetic sequence/revision.
 *
 * Single-flight Sync: one HTTP sync at a time. REQUEST_FULL_SYNC latches.
 * Stale generations never clear a newer in-flight owner.
 *
 * Effect-consumption rule:
 * - WS delta REQUEST_FULL_SYNC is consumed only here from the exact dispatch
 *   result (not mutable getLastEffects()).
 * - Controller drainEffects handles REQUEST_FULL_SYNC only for effects from
 *   its own dispatches; both paths share this single-flight entry so parallel
 *   syncs cannot start.
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
  beginSyncFlight,
  completeSyncFlight,
  createInitialSyncFlightState,
  latchPendingFullSync,
  type SyncFlightReason,
  type SyncFlightState,
} from '@/notification-runtime/notification-runtime.sync-flight';
import {
  logNotificationsSyncDiag,
  nextNotificationsSyncCorrelationId,
} from '@/notification-runtime/notifications-sync-diag';
import { rec } from '@/notifications/diagnostics/notifications-recorder-bridge';

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
  const flightRef = useRef<SyncFlightState>(createInitialSyncFlightState());
  const coldBootSettledRef = useRef(false);
  const runBootstrapRef = useRef<
    (reason: SyncFlightReason) => Promise<void>
  >(async () => {});

  const runBootstrap = useCallback(
    async (reason: SyncFlightReason) => {
      const tok = tokenRef.current;
      const uid = userIdRef.current;
      if (!tok || !uid) return;

      if (reason === 'reconnect') {
        const decision = decideReconnectRecoveryRequest(store.getState());
        if (decision.action === 'coalesce') {
          return;
        }
      }

      const begun = beginSyncFlight(flightRef.current, reason);
      flightRef.current = begun.state;
      if (!begun.accepted) {
        logNotificationsSyncDiag(
          nextNotificationsSyncCorrelationId(reason),
          'REQUEST_FULL_SYNC',
          {
            coalesced: true,
            latchReason: begun.reason,
            pendingFullSync: flightRef.current.pendingFullSync,
            inFlight: flightRef.current.inFlight,
          },
        );
        rec('transport', 'FULL_SYNC_REQUESTED', {
          result: 'coalesced',
          metadata: {
            reason,
            latchReason: begun.reason,
            pendingFullSync: flightRef.current.pendingFullSync,
          },
        });
        return;
      }

      const { generation, forceFullSnapshot } = begun;
      if (reason === 'reconnect') {
        runtimePortRef.current?.notifyReconnectStarted();
      }

      const correlationId = nextNotificationsSyncCorrelationId(reason);
      const revisionBefore = store.getState().revision;
      rec('transport', 'SYNC_FLIGHT_BEGIN', {
        correlationId,
        stateBefore: {
          revision: revisionBefore,
          syncStatus: store.getState().syncStatus,
          flightGeneration: generation,
          reason,
          forceFullSnapshot,
        },
      });
      rec('transport', 'HTTP_SYNC_BEGIN', {
        correlationId,
        metadata: {
          reason,
          recovery: reason === 'reconnect' && !forceFullSnapshot,
          afterRevision: forceFullSnapshot
            ? null
            : reason === 'reconnect'
              ? revisionBefore
              : null,
        },
      });
      let ok = false;
      try {
        const recovery = reason === 'reconnect' && !forceFullSnapshot;
        const result = await runNotificationsSyncViaMapper(store, {
          token: tok,
          recovery,
          afterRevision: forceFullSnapshot
            ? null
            : recovery
              ? store.getState().revision
              : null,
          correlationId,
        });
        ok = result.ok;
        rec('transport', 'HTTP_SYNC_RESPONSE', {
          correlationId,
          result: ok ? 'ok' : 'failed',
          rejectionReason: result.errorCode ?? null,
          stateAfter: {
            revision: store.getState().revision,
            syncStatus: store.getState().syncStatus,
            passiveItemIds: [...store.getState().passiveItemIds],
            activeItemId: store.getState().activeItemId,
          },
          metadata: {
            reason,
            flightGeneration: generation,
          },
        });
        rec('transport', 'RECONCILIATION_BEGIN', {
          correlationId,
          stateBefore: { revision: revisionBefore },
        });
        rec('transport', 'RECONCILIATION_RESULT', {
          correlationId,
          result: ok ? 'ok' : 'failed',
          stateAfter: {
            revision: store.getState().revision,
            syncStatus: store.getState().syncStatus,
            passiveItemIds: [...store.getState().passiveItemIds],
            activeItemId: store.getState().activeItemId,
          },
        });
        rec('transport', ok ? 'HTTP_SYNC_COMPLETE' : 'HTTP_SYNC_FAILED', {
          correlationId,
          result: ok ? 'ok' : 'failed',
          rejectionReason: result.errorCode ?? null,
          stateAfter: {
            revision: store.getState().revision,
            syncStatus: store.getState().syncStatus,
            passiveItemIds: [...store.getState().passiveItemIds],
          },
        });
        const sessionMatches =
          tokenRef.current === tok && userIdRef.current === uid;
        if (
          generation === flightRef.current.generation &&
          flightRef.current.ownerGeneration === generation &&
          sessionMatches
        ) {
          const st = store.getState();
          logNotificationsSyncDiag(correlationId, 'AVAILABILITY', {
            syncStatus: st.syncStatus,
            revision: st.revision,
            passiveItemIds: [...st.passiveItemIds],
            ok: result.ok,
            errorCode: result.errorCode ?? null,
          });
        }
      } finally {
        const sessionMatches =
          tokenRef.current === tok && userIdRef.current === uid;
        const settled = completeSyncFlight(flightRef.current, {
          generation,
          reason,
          ok,
          coldBootSettled: coldBootSettledRef.current,
          sessionMatches,
        });
        flightRef.current = settled.state;

        if (!settled.isOwner) {
          rec('transport', 'SYNC_FLIGHT_STALE_COMPLETE', {
            correlationId,
            metadata: { generation, reason },
          });
          // Stale generation — must not clear newer in-flight ownership or
          // complete boot/reconnect for a newer request.
          return;
        }

        rec('transport', 'SYNC_FLIGHT_COMPLETE', {
          correlationId,
          result: ok ? 'ok' : 'failed',
          stateAfter: {
            revision: store.getState().revision,
            syncStatus: store.getState().syncStatus,
            flightGeneration: generation,
          },
        });

        if (settled.shouldNotifyBootCompleted) {
          coldBootSettledRef.current = true;
          runtimePortRef.current?.notifyBootCompleted();
        }
        if (settled.shouldNotifyReconnectCompleted) {
          runtimePortRef.current?.notifyReconnectCompleted();
        }
        if (settled.shouldRunPendingFullSync) {
          logNotificationsSyncDiag(correlationId, 'REQUEST_FULL_SYNC', {
            drainedPending: true,
            afterRevision: null,
          });
          rec('transport', 'FULL_SYNC_REQUESTED', {
            correlationId,
            metadata: { drainedPending: true },
          });
          void runBootstrapRef.current('user');
        }
      }
    },
    [store],
  );
  runBootstrapRef.current = runBootstrap;

  const requestFullSync = useCallback(
    (diagReason: string) => {
      const latched = latchPendingFullSync(flightRef.current);
      flightRef.current = latched.state;
      logNotificationsSyncDiag(
        nextNotificationsSyncCorrelationId('ws'),
        'REQUEST_FULL_SYNC',
        {
          reason: diagReason,
          pendingFullSync: flightRef.current.pendingFullSync,
          shouldStartNow: latched.shouldStartNow,
          revision: store.getState().revision,
          syncStatus: store.getState().syncStatus,
        },
      );
      if (latched.shouldStartNow) {
        void runBootstrap('user');
      }
    },
    [runBootstrap, store],
  );

  useEffect(() => {
    coldBootSettledRef.current = false;
    flightRef.current = createInitialSyncFlightState();
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
      rec('transport', 'WS_DELTA_RECEIVED', {
        correlationId,
        stateBefore: {
          revision: store.getState().revision,
          passiveItemIds: [...store.getState().passiveItemIds],
        },
        metadata: {
          fromRevision: delta.fromRevision,
          toRevision: delta.revision,
          operationCount: delta.operations.length,
          operationTypes: delta.operations.map((o) => o.type).slice(0, 32),
        },
      });
      const applied = applyNotificationsDeltaToStore(store, {
        delta,
        source: 'websocket',
        correlationId,
      });
      rec('transport', 'WS_DELTA_MAPPED', {
        correlationId,
        stateAfter: {
          revision: store.getState().revision,
          passiveItemIds: [...store.getState().passiveItemIds],
          activeItemId: store.getState().activeItemId,
        },
        metadata: {
          effectTypes: applied.effects.map((e) => e.type),
        },
      });
      // Consume effects from this exact dispatch — not mutable getLastEffects().
      const fullSync = applied.effects.find((e) => e.type === 'REQUEST_FULL_SYNC');
      if (fullSync && fullSync.type === 'REQUEST_FULL_SYNC') {
        requestFullSync(fullSync.reason);
      }
    },
    [store, requestFullSync],
  );

  const onReconnect = useCallback(() => {
    void runBootstrap('reconnect');
  }, [runBootstrap]);

  useWebSocket(token, onWsEvent, onReconnect);

  useEffect(() => {
    const api = {
      refresh: (reason: SyncFlightReason = 'user') => runBootstrap(reason),
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
