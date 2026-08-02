/**
 * Stage 7 Phase 1 — NotificationRuntime transport (bootstrap / pending / WS).
 * Writes only into NotificationRuntime. No preference / legacy sinks.
 */
'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { BanInteraction, BanResult, SessionState } from '@98plus/shared';
import { useWebSocket } from '@/hooks/useWebSocket';
import { fetchPendingChainPrefetch } from '@/lib/pending-chain-prefetch';
import { fetchSession } from '@/lib/session';
import { enrichBanInteraction } from '@/lib/user-public-avatar';
import {
  completeBootstrap,
  failBootstrap,
  requestBootstrap,
} from '@/notification-runtime/notification-runtime.bootstrap';
import {
  completeNotificationIdentity,
  itemFromCheck,
  itemFromIncoming,
  itemFromResult,
  receiveNotificationItem,
} from '@/notification-runtime/notification-runtime.ingest';
import {
  ingestPendingSnapshot,
  nextPendingAuthorityGeneration,
  pendingIdsFromPrefetchParts,
  pendingItemIdFromParts,
} from '@/notification-runtime/notification-runtime.pending';
import { decideReconnectRecoveryRequest } from '@/notification-runtime/notification-runtime.reconnect-recovery';
import { useNotificationRuntimeStore } from '@/notification-runtime/notification-runtime.context';
import { notificationItemId } from '@/notification-runtime/notification-runtime.types';
import type { NotificationItem } from '@/notification-runtime/notification-runtime.types';
import {
  stageMatchingActionResult,
  snapshotRuntimeForActionResultHandoff,
} from '@/notification-runtime/notification-runtime.action-result-handoff';
import type { NotificationRuntimePortHandle } from '@/app-coordinator/notification-runtime-port';

export type NotificationTransportAuth = {
  token: string | null;
  userId: string | null;
  runtimePort?: NotificationRuntimePortHandle | null;
};

/**
 * Mount once under NotificationRuntimeProvider.
 * Owns bootstrap, pending refresh, websocket ingest, reconnect recovery.
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
  const runPendingRefreshRef = useRef<(reason: string) => Promise<void>>(
    async () => {},
  );

  const runBootstrap = useCallback(
    async (reason: 'bootstrap' | 'reconnect' | 'user') => {
      const tok = tokenRef.current;
      const uid = userIdRef.current;
      if (!tok || !uid) return;
      if (bootInFlightRef.current && reason !== 'reconnect') return;

      if (reason === 'reconnect') {
        const decision = decideReconnectRecoveryRequest(store.getState());
        if (decision.action === 'coalesce') {
          console.log('[ws-reconnect-recovery]', decision);
          return;
        }
        runtimePortRef.current?.notifyReconnectStarted();
      }

      bootInFlightRef.current = true;
      const generation = nextPendingAuthorityGeneration();
      const bootReq = requestBootstrap(store, { source: 'bootstrap' });
      if (!bootReq.accepted) {
        bootInFlightRef.current = false;
        if (reason === 'reconnect') {
          runtimePortRef.current?.notifyReconnectCompleted();
        }
        return;
      }
      try {
        const session = await fetchSession(tok);
        if (tokenRef.current !== tok || userIdRef.current !== uid) {
          failBootstrap(store, {
            transitionId: bootReq.transitionId,
            errorCode: 'AUTH_SWITCHED',
            source: 'bootstrap',
          });
          return;
        }
        const { items, pendingItemIds, consumedItemIds } =
          sessionToRuntimeSnapshot(session);
        completeBootstrap(store, {
          transitionId: bootReq.transitionId,
          items,
          pendingItemIds,
          consumedItemIds,
          sourceVersion: `session:${Date.now()}`,
          source: 'bootstrap',
          generation,
        });
        // Session.incoming is at most one card. Hydrate the full pending FIFO
        // so manual Notifications open sees every ready item (no auto-activate).
        await runPendingRefreshRef.current(`after-bootstrap:${reason}`);
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
          // Stage 7 Phase 1 — never auto-activate on boot.
          runtimePortRef.current?.notifyBootCompleted();
        }
        if (reason === 'reconnect') {
          runtimePortRef.current?.notifyReconnectCompleted();
        }
      }
    },
    [store],
  );

  const runPendingRefresh = useCallback(
    async (reason: string) => {
      const tok = tokenRef.current;
      const uid = userIdRef.current;
      if (!tok || !uid) return;
      const generation = nextPendingAuthorityGeneration();
      try {
        const prefetched = await fetchPendingChainPrefetch(tok, {
          source: `direct-host:${reason}`,
          telegramUserId: uid,
          reason: `NotificationRuntimeTransport:${reason}`,
        });
        if (tokenRef.current !== tok || userIdRef.current !== uid) return;
        const serverPendingIds = pendingIdsFromPrefetchParts({
          incomingIds: prefetched.incoming.map((b) => b.id),
          checkId: prefetched.check?.id ?? null,
          resultId: prefetched.result?.id ?? null,
        });
        ingestPendingSnapshot(
          store,
          serverPendingIds,
          'poll',
          `prefetch:${reason}:${serverPendingIds.join(',')}`,
          generation,
        );
        const items: NotificationItem[] = [
          ...prefetched.incoming.map(itemFromIncoming),
          ...(prefetched.check ? [itemFromCheck(prefetched.check)] : []),
          ...(prefetched.result ? [itemFromResult(prefetched.result)] : []),
        ];
        for (const item of items) {
          const id = notificationItemId(item);
          const already = store
            .getState()
            .items.queue.some((q) => notificationItemId(q) === id);
          if (!already) {
            receiveNotificationItem(store, {
              item,
              source: 'poll',
              mergePending: false,
            });
          }
        }
      } catch {
        // Soft-fail refresh; runtime keeps prior authority.
      }
    },
    [store],
  );

  runPendingRefreshRef.current = runPendingRefresh;

  useEffect(() => {
    coldBootSettledRef.current = false;
    if (!token || !userId) return;
    void runBootstrap('bootstrap');
  }, [token, userId, runBootstrap]);

  const onWsEvent = useCallback(
    (event: { type: string; payload: unknown }) => {
      switch (event.type) {
        case 'ban:incoming': {
          const ban = event.payload as BanInteraction;
          if (!ban?.id) return;
          receiveNotificationItem(store, {
            item: itemFromIncoming(ban),
            source: 'websocket',
          });
          break;
        }
        case 'check:due':
        case 'check:waiting': {
          const ban = event.payload as BanInteraction;
          if (!ban?.id) return;
          receiveNotificationItem(store, {
            item: itemFromCheck(ban),
            source: 'websocket',
          });
          break;
        }
        case 'check:completed': {
          const result =
            (event.payload as { result?: BanResult })?.result ??
            (event.payload as BanResult);
          if (!result?.id) return;
          const banId = result.id;
          stageMatchingActionResult({
            banId,
            result,
            source: 'ws',
            runtime: snapshotRuntimeForActionResultHandoff(store.getState()),
          });
          receiveNotificationItem(store, {
            item: itemFromResult(result),
            source: 'websocket',
          });
          const checkId = pendingItemIdFromParts('check', banId);
          const incomingId = pendingItemIdFromParts('incoming', banId);
          if (checkId) completeNotificationIdentity(store, checkId, 'websocket');
          if (incomingId) {
            completeNotificationIdentity(store, incomingId, 'websocket');
          }
          break;
        }
        case 'sync:session': {
          void runBootstrap('user');
          break;
        }
        default:
          break;
      }
    },
    [runBootstrap, store],
  );

  const onReconnect = useCallback(() => {
    void runBootstrap('reconnect');
  }, [runBootstrap]);

  useWebSocket(token, onWsEvent, onReconnect);

  useEffect(() => {
    const api = {
      refresh: (reason: 'bootstrap' | 'reconnect' | 'user' = 'user') =>
        reason === 'user'
          ? runPendingRefresh('user-refresh')
          : runBootstrap(reason),
      pendingRefresh: () => runPendingRefresh('intent'),
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
  }, [runBootstrap, runPendingRefresh]);

  return null;
}

function sessionToRuntimeSnapshot(session: SessionState): {
  items: NotificationItem[];
  pendingItemIds: string[];
  consumedItemIds: string[];
} {
  const items: NotificationItem[] = [];
  const pendingItemIds: string[] = [];
  if (session.incoming?.id) {
    const ban = enrichBanInteraction(session.incoming);
    items.push(itemFromIncoming(ban));
    const id = pendingItemIdFromParts('incoming', ban.id);
    if (id) pendingItemIds.push(id);
  }
  if (session.check?.id) {
    const ban = enrichBanInteraction(session.check);
    items.push(itemFromCheck(ban));
    const id = pendingItemIdFromParts('check', ban.id);
    if (id) pendingItemIds.push(id);
  }
  if (session.pendingResultId) {
    const id = pendingItemIdFromParts('result', session.pendingResultId);
    if (id) pendingItemIds.push(id);
  }
  return { items, pendingItemIds, consumedItemIds: [] };
}

/** Imperative refresh used by intents when transport is mounted. */
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
