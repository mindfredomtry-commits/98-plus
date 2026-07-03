'use client';

import { useEffect, type MutableRefObject } from 'react';
import type { BanInteraction } from '@98plus/shared';
import { api } from '@/lib/api';
import { shouldShowIncomingBanModal } from '@/lib/incoming-challenge';
import type { QueueAppearanceReactionTracePayload } from '@/lib/queue-appearance-reaction-trace';
import type { OwnerQueuePopulationTracePayload } from '@/lib/owner-queue-population-trace';
import { observeOwnerQueuePopulationStackPoint } from '@/lib/owner-queue-population-trace';
import {
  logQueueApiFetchResult,
  logQueueApiFetchStart,
  maybeLogQueueApiEmptyButDirectBanExists,
  readKnownDirectBanId,
} from '@/lib/queue-api-fetch-debug';

/** Receiver-side safety net when WS delivery fails. */
export const INCOMING_POLL_INTERVAL_MS = 2500;

type ReceiveIncoming = (
  payload: BanInteraction,
  source: 'ws' | 'session' | 'poll',
) => void;

type QueueAppearanceSnapshot = {
  queueLen: number;
  pendingLen: number;
  ownerQueueLen: number;
  ownerPendingLen: number;
  activeKind: string | null;
  queueHeadKind: string | null;
  lobbyBansNeedAttention: boolean;
  indicatorVisible: boolean;
  notificationSessionActive: boolean;
};

export function useIncomingPoll(params: {
  userId: string | null | undefined;
  token: string | null | undefined;
  receiveIncomingBan: ReceiveIncoming;
  dismissedIncomingRef: MutableRefObject<Set<string>>;
  getOpenIncomingBan: () => BanInteraction | null;
  userIdRef: MutableRefObject<string | null>;
  tokenRef: MutableRefObject<string | null>;
  traceQueueAppearanceRef?: MutableRefObject<
    (
      input: Partial<QueueAppearanceReactionTracePayload> & { source: string },
    ) => void
  >;
  readQueueAppearanceSnapshotRef?: MutableRefObject<() => QueueAppearanceSnapshot>;
  traceOwnerQueuePopulationRef?: MutableRefObject<
    (
      input: Partial<OwnerQueuePopulationTracePayload> & {
        source: string;
        reason: string;
        ownerQueueBefore: number;
        ownerPendingBefore: number;
        ownerQueueAfter: number;
        ownerPendingAfter: number;
        mutationApplied: boolean;
        mutationSkipped: boolean;
      },
    ) => void
  >;
}) {
  const {
    userId,
    token,
    receiveIncomingBan,
    dismissedIncomingRef,
    getOpenIncomingBan,
    userIdRef,
    tokenRef,
    traceQueueAppearanceRef,
    readQueueAppearanceSnapshotRef,
    traceOwnerQueuePopulationRef,
  } = params;

  const emitOwnerPopulationTrace = (
    source: string,
    reason: string,
    extra: Partial<OwnerQueuePopulationTracePayload> = {},
    snapshot?: QueueAppearanceSnapshot,
  ) => {
    const snap = snapshot ?? readQueueAppearanceSnapshotRef?.current?.();
    const ownerQueue = snap?.ownerQueueLen ?? -1;
    const ownerPending = snap?.ownerPendingLen ?? -1;
    const payload = {
      source,
      reason,
      telegramUserId: userIdRef.current,
      ownerQueueBefore: extra.ownerQueueBefore ?? ownerQueue,
      ownerQueueAfter: extra.ownerQueueAfter ?? ownerQueue,
      ownerPendingBefore: extra.ownerPendingBefore ?? ownerPending,
      ownerPendingAfter: extra.ownerPendingAfter ?? ownerPending,
      mutationApplied: extra.mutationApplied ?? false,
      mutationSkipped: extra.mutationSkipped ?? false,
      skipReason: extra.skipReason ?? null,
      incomingBanId: extra.incomingBanId ?? null,
      resultBanId: extra.resultBanId ?? null,
      notificationKind: extra.notificationKind ?? null,
    };
    if (traceOwnerQueuePopulationRef?.current) {
      traceOwnerQueuePopulationRef.current(payload);
      return;
    }
    observeOwnerQueuePopulationStackPoint(source, reason, payload);
  };

  const emitQueueAppearanceTrace = (
    source: string,
    extra: Partial<QueueAppearanceReactionTracePayload> = {},
    snapshot?: QueueAppearanceSnapshot,
  ) => {
    const snap = snapshot ?? readQueueAppearanceSnapshotRef?.current?.();
    traceQueueAppearanceRef?.current({
      source,
      telegramUserId: userIdRef.current,
      prevQueueLen: snap?.queueLen,
      nextQueueLen: snap?.queueLen,
      prevPendingLen: snap?.pendingLen,
      nextPendingLen: snap?.pendingLen,
      lobbyBansNeedAttention: snap?.lobbyBansNeedAttention,
      indicatorVisible: snap?.indicatorVisible,
      activeKind: snap?.activeKind ?? null,
      queueHeadKind: snap?.queueHeadKind ?? null,
      notificationSessionActive: snap?.notificationSessionActive,
      ...extra,
    });
  };

  useEffect(() => {
    if (!userId || !token) return;

    let stopped = false;
    let inFlight = false;

    const tick = async () => {
      if (stopped || inFlight) return;

      if (document.visibilityState !== 'visible') {
        console.log('[incoming-poll-skip]', { reason: 'hidden' });
        return;
      }

      const viewerId = userIdRef.current;
      const activeToken = tokenRef.current;
      if (!viewerId || !activeToken) {
        console.log('[incoming-poll-skip]', { reason: 'no-auth' });
        return;
      }

      const open = getOpenIncomingBan();
      if (
        open?.id &&
        shouldShowIncomingBanModal(
          open,
          viewerId,
          dismissedIncomingRef.current,
        )
      ) {
        console.log('[incoming-poll-skip]', {
          reason: 'modal-open',
          banId: open.id,
        });
        return;
      }

      inFlight = true;
      try {
        logQueueApiFetchStart({
          source: 'useIncomingPoll',
          endpoint: '/bans/incoming/pending',
          telegramUserId: viewerId,
          reason: 'incoming-poll-tick',
        });
        const { ban } = await api<{ ban: BanInteraction | null }>(
          '/bans/incoming/pending',
          { token: activeToken },
        );

        if (stopped) return;
        if (tokenRef.current !== activeToken || userIdRef.current !== viewerId) {
          console.log('[incoming-poll-skip]', { reason: 'auth-changed' });
          return;
        }

        if (!ban?.id) {
          logQueueApiFetchResult({
            source: 'useIncomingPoll',
            endpoint: '/bans/incoming/pending',
            telegramUserId: viewerId,
            count: 0,
            incomingCount: 0,
            checkCount: 0,
            resultCount: 0,
            banIds: [],
            statuses: [],
            kinds: [],
          });
          maybeLogQueueApiEmptyButDirectBanExists(
            '/bans/incoming/pending',
            0,
            {
              source: 'useIncomingPoll',
              telegramUserId: viewerId,
              knownDirectBanId: readKnownDirectBanId(),
            },
          );
          console.log('INCOMING POLL RECEIVED', {
            banId: null,
            skipped: true,
            reason: 'empty',
          });
          emitQueueAppearanceTrace('useIncomingPoll:INCOMING_POLL_RECEIVED', {
            skipReason: 'empty',
          });
          emitOwnerPopulationTrace(
            'INCOMING_POLL_RECEIVED',
            'incoming-poll-empty',
            {
              mutationSkipped: true,
              skipReason: 'empty',
            },
          );
          return;
        }

        if (dismissedIncomingRef.current.has(ban.id)) {
          console.log('INCOMING POLL RECEIVED', {
            banId: ban.id,
            skipped: true,
            reason: 'dismissed-session',
          });
          emitQueueAppearanceTrace('useIncomingPoll:INCOMING_POLL_RECEIVED', {
            skipReason: 'dismissed-session',
            queueHeadKind: 'incoming',
          });
          emitOwnerPopulationTrace(
            'INCOMING_POLL_RECEIVED',
            'incoming-poll-dismissed-session',
            {
              mutationSkipped: true,
              skipReason: 'dismissed-session',
              incomingBanId: ban.id,
              notificationKind: 'incoming',
            },
          );
          return;
        }

        logQueueApiFetchResult({
          source: 'useIncomingPoll',
          endpoint: '/bans/incoming/pending',
          telegramUserId: viewerId,
          count: 1,
          incomingCount: 1,
          checkCount: 0,
          resultCount: 0,
          banIds: [ban.id],
          statuses: [ban.status ?? null],
          kinds: ['incoming'],
        });
        const snapshotBefore = readQueueAppearanceSnapshotRef?.current?.();
        console.log('INCOMING POLL RECEIVED', { banId: ban.id });
        emitOwnerPopulationTrace(
          'INCOMING_POLL_RECEIVED',
          'incoming-poll-received-before-receive',
          {
            incomingBanId: ban.id,
            notificationKind: 'incoming',
          },
          snapshotBefore,
        );
        emitQueueAppearanceTrace(
          'useIncomingPoll:INCOMING_POLL_RECEIVED',
          {
            skipReason: null,
            queueHeadKind: 'incoming',
            willStartOnClick: true,
          },
          snapshotBefore,
        );
        receiveIncomingBan(ban, 'poll');
        const snapshotAfter = readQueueAppearanceSnapshotRef?.current?.();
        emitOwnerPopulationTrace(
          'INCOMING_POLL_RECEIVED',
          'incoming-poll-received-after-receive',
          {
            ownerQueueBefore: snapshotBefore?.ownerQueueLen ?? -1,
            ownerPendingBefore: snapshotBefore?.ownerPendingLen ?? -1,
            ownerQueueAfter: snapshotAfter?.ownerQueueLen ?? -1,
            ownerPendingAfter: snapshotAfter?.ownerPendingLen ?? -1,
            mutationApplied:
              (snapshotAfter?.ownerQueueLen ?? 0) >
                (snapshotBefore?.ownerQueueLen ?? 0) ||
              (snapshotAfter?.ownerPendingLen ?? 0) >
                (snapshotBefore?.ownerPendingLen ?? 0),
            mutationSkipped:
              (snapshotAfter?.ownerQueueLen ?? 0) ===
                (snapshotBefore?.ownerQueueLen ?? 0) &&
              (snapshotAfter?.ownerPendingLen ?? 0) ===
                (snapshotBefore?.ownerPendingLen ?? 0),
            skipReason:
              (snapshotAfter?.ownerQueueLen ?? 0) ===
                (snapshotBefore?.ownerQueueLen ?? 0) &&
              (snapshotAfter?.ownerPendingLen ?? 0) ===
                (snapshotBefore?.ownerPendingLen ?? 0)
                ? 'receive-incoming-did-not-mutate-owner'
                : null,
            incomingBanId: ban.id,
            notificationKind: 'incoming',
          },
        );
        emitQueueAppearanceTrace('useIncomingPoll:INCOMING_POLL_RECEIVED:after-receive', {
          prevQueueLen: snapshotBefore?.queueLen,
          nextQueueLen: snapshotAfter?.queueLen,
          prevPendingLen: snapshotBefore?.pendingLen,
          nextPendingLen: snapshotAfter?.pendingLen,
          lobbyBansNeedAttention: snapshotAfter?.lobbyBansNeedAttention,
          indicatorVisible: snapshotAfter?.indicatorVisible,
          activeKind: snapshotAfter?.activeKind ?? null,
          queueHeadKind: snapshotAfter?.queueHeadKind ?? 'incoming',
          notificationSessionActive: snapshotAfter?.notificationSessionActive,
          skipReason: null,
        });
      } catch {
        console.log('[incoming-poll-skip]', { reason: 'request-failed' });
      } finally {
        inFlight = false;
      }
    };

    console.log('[incoming-poll-start]', { userId });

    void tick();
    const timer = window.setInterval(() => void tick(), INCOMING_POLL_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [
    userId,
    token,
    receiveIncomingBan,
    dismissedIncomingRef,
    getOpenIncomingBan,
    userIdRef,
    tokenRef,
    traceQueueAppearanceRef,
    readQueueAppearanceSnapshotRef,
    traceOwnerQueuePopulationRef,
  ]);
}
