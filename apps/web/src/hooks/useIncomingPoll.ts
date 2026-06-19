'use client';

import { useEffect, type MutableRefObject } from 'react';
import type { BanInteraction } from '@98plus/shared';
import { api } from '@/lib/api';
import { shouldShowIncomingBanModal } from '@/lib/incoming-challenge';
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

export function useIncomingPoll(params: {
  userId: string | null | undefined;
  token: string | null | undefined;
  receiveIncomingBan: ReceiveIncoming;
  dismissedIncomingRef: MutableRefObject<Set<string>>;
  getOpenIncomingBan: () => BanInteraction | null;
  userIdRef: MutableRefObject<string | null>;
  tokenRef: MutableRefObject<string | null>;
}) {
  const {
    userId,
    token,
    receiveIncomingBan,
    dismissedIncomingRef,
    getOpenIncomingBan,
    userIdRef,
    tokenRef,
  } = params;

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
          return;
        }

        if (dismissedIncomingRef.current.has(ban.id)) {
          console.log('INCOMING POLL RECEIVED', {
            banId: ban.id,
            skipped: true,
            reason: 'dismissed-session',
          });
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
        console.log('INCOMING POLL RECEIVED', { banId: ban.id });
        receiveIncomingBan(ban, 'poll');
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
  ]);
}
