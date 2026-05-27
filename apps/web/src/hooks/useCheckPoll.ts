'use client';

import { useEffect, type MutableRefObject } from 'react';
import type { BanInteraction } from '@98plus/shared';
import { api } from '@/lib/api';
import { shouldShowCheckOverlay } from '@/lib/check-overlay';

export const CHECK_POLL_INTERVAL_MS = 2500;

type ReceiveCheck = (
  payload: BanInteraction,
  source: 'ws' | 'session' | 'poll',
) => void;

export function useCheckPoll(params: {
  userId: string | null | undefined;
  token: string | null | undefined;
  receiveCheckBan: ReceiveCheck;
  dismissedCheckSessionRef: MutableRefObject<Set<string>>;
  answeredCheckRef: MutableRefObject<Set<string>>;
  checkAnswerInFlightRef: MutableRefObject<Set<string>>;
  resultOpenRef: MutableRefObject<boolean>;
  getOpenCheckBan: () => BanInteraction | null;
  userIdRef: MutableRefObject<string | null>;
  tokenRef: MutableRefObject<string | null>;
}) {
  const {
    userId,
    token,
    receiveCheckBan,
    dismissedCheckSessionRef,
    answeredCheckRef,
    checkAnswerInFlightRef,
    resultOpenRef,
    getOpenCheckBan,
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
        console.log('[check-poll-skip]', { reason: 'hidden' });
        return;
      }

      const viewerId = userIdRef.current;
      const activeToken = tokenRef.current;
      if (!viewerId || !activeToken) {
        console.log('[check-poll-skip]', { reason: 'no-auth' });
        return;
      }

      if (resultOpenRef.current) {
        console.log('[check-poll-skip]', { reason: 'result-open' });
        return;
      }

      const open = getOpenCheckBan();
      if (
        open?.id &&
        shouldShowCheckOverlay(
          open,
          viewerId,
          dismissedCheckSessionRef.current,
          answeredCheckRef.current,
          checkAnswerInFlightRef.current,
          resultOpenRef.current,
        )
      ) {
        console.log('[check-poll-skip]', {
          reason: 'modal-open',
          banId: open.id,
        });
        return;
      }

      inFlight = true;
      try {
        const { ban } = await api<{ ban: BanInteraction | null }>(
          '/bans/check/pending',
          { token: activeToken },
        );

        if (stopped) return;
        if (tokenRef.current !== activeToken || userIdRef.current !== viewerId) {
          console.log('[check-poll-skip]', { reason: 'auth-changed' });
          return;
        }

        if (!ban?.id) {
          console.log('[check-poll-empty]');
          return;
        }

        if (dismissedCheckSessionRef.current.has(ban.id)) {
          console.log('[check-poll-skip]', {
            reason: 'dismissed',
            banId: ban.id,
          });
          return;
        }
        if (answeredCheckRef.current.has(ban.id)) {
          console.log('[check-poll-skip]', {
            reason: 'answered',
            banId: ban.id,
          });
          return;
        }

        console.log('[check-poll-hit]', { banId: ban.id });
        receiveCheckBan(ban, 'poll');
      } catch {
        console.log('[check-poll-skip]', { reason: 'request-failed' });
      } finally {
        inFlight = false;
      }
    };

    console.log('[check-poll-start]', { userId });
    void tick();
    const timer = window.setInterval(() => void tick(), CHECK_POLL_INTERVAL_MS);

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
    receiveCheckBan,
    dismissedCheckSessionRef,
    answeredCheckRef,
    checkAnswerInFlightRef,
    resultOpenRef,
    getOpenCheckBan,
    userIdRef,
    tokenRef,
  ]);
}
