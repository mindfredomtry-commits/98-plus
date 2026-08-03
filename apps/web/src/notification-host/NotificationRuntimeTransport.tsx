/**
 * Stage 8 Phase 8 — NotificationRuntime transport.
 * Temporary adapter → APPLY_SNAPSHOT / APPLY_DELTA. No queue clear/replace.
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
import { decideReconnectRecoveryRequest } from '@/notification-runtime/notification-runtime.reconnect-recovery';
import {
  completeNotificationIdentity,
  itemFromCheck,
  itemFromIncoming,
  itemFromResult,
  receiveNotificationItem,
  receiveNotificationItems,
} from '@/notification-runtime/notification-runtime.ingest';
import { useNotificationRuntimeStore } from '@/notification-runtime/notification-runtime.context';
import { notificationItemId } from '@/notification-runtime/notification-runtime.types';
import type { NotificationItem } from '@/notification-runtime/notification-runtime.types';
import type { NotificationRuntimePortHandle } from '@/app-coordinator/notification-runtime-port';

export type NotificationTransportAuth = {
  token: string | null;
  userId: string | null;
  runtimePort?: NotificationRuntimePortHandle | null;
};

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

      const bootReq = requestBootstrap(store, {
        source: 'bootstrap',
        recovery: reason === 'reconnect',
      });
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
        const { items } = sessionToRuntimeSnapshot(session);
        completeBootstrap(store, {
          transitionId: bootReq.transitionId,
          items,
          userId: uid,
          source: 'bootstrap',
        });
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
      try {
        const prefetched = await fetchPendingChainPrefetch(tok, {
          source: `direct-host:${reason}`,
          telegramUserId: uid,
          reason: `NotificationRuntimeTransport:${reason}`,
        });
        if (tokenRef.current !== tok || userIdRef.current !== uid) return;
        const items: NotificationItem[] = [
          ...prefetched.incoming.map(itemFromIncoming),
          ...(prefetched.check ? [itemFromCheck(prefetched.check)] : []),
          ...(prefetched.result ? [itemFromResult(prefetched.result)] : []),
        ];
        // Merge into target Runtime via snapshot (preserves active; no clear).
        const existing = Object.values(store.getState().presentationByItemId);
        const byId = new Map<string, NotificationItem>();
        for (const item of existing) {
          byId.set(notificationItemId(item), item);
        }
        for (const item of items) {
          byId.set(notificationItemId(item), item);
        }
        receiveNotificationItems(store, {
          items: [...byId.values()],
          source: 'poll',
          userId: uid,
        });
      } catch {
        // Soft-fail refresh.
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
      const uid = userIdRef.current;
      if (!uid) return;
      switch (event.type) {
        case 'ban:incoming': {
          const ban = event.payload as BanInteraction;
          if (!ban?.id) return;
          receiveNotificationItem(store, {
            item: itemFromIncoming(ban),
            source: 'websocket',
            userId: uid,
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
            userId: uid,
          });
          break;
        }
        case 'check:completed': {
          const result =
            (event.payload as { result?: BanResult })?.result ??
            (event.payload as BanResult);
          if (!result?.id) return;
          const banId = String(result.id);
          receiveNotificationItem(store, {
            item: itemFromResult(result),
            source: 'websocket',
            userId: uid,
          });
          completeNotificationIdentity(store, {
            banId,
            kinds: ['check', 'incoming'],
            source: 'websocket',
            userId: uid,
          });
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
} {
  const items: NotificationItem[] = [];
  if (session.incoming?.id) {
    items.push(itemFromIncoming(enrichBanInteraction(session.incoming)));
  }
  if (session.check?.id) {
    items.push(itemFromCheck(enrichBanInteraction(session.check)));
  }
  return { items };
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
