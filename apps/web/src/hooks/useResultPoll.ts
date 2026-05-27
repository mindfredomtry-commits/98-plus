'use client';

import { useEffect, type MutableRefObject } from 'react';
import type { BanResult } from '@98plus/shared';
import { api } from '@/lib/api';
import { resultShowDecision } from '@/lib/ban-result-flow';

export const RESULT_POLL_INTERVAL_MS = 2500;

type ReceiveResult = (
  payload: BanResult,
  source: 'ws' | 'session' | 'poll' | 'http',
) => void;

export function useResultPoll(params: {
  userId: string | null | undefined;
  token: string | null | undefined;
  receiveResult: ReceiveResult;
  getOpenResult: () => BanResult | null;
  userIdRef: MutableRefObject<string | null>;
  tokenRef: MutableRefObject<string | null>;
}) {
  const {
    userId,
    token,
    receiveResult,
    getOpenResult,
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
        console.log('[result-poll-skip]', { reason: 'hidden' });
        return;
      }

      const viewerId = userIdRef.current;
      const activeToken = tokenRef.current;
      if (!viewerId || !activeToken) {
        console.log('[result-poll-skip]', { reason: 'no-auth' });
        return;
      }

      if (getOpenResult()?.id) {
        console.log('[result-poll-skip]', {
          reason: 'result-open',
          banId: getOpenResult()?.id,
        });
        return;
      }

      inFlight = true;
      try {
        const { result } = await api<{ result: BanResult | null }>(
          '/bans/result/pending',
          { token: activeToken },
        );

        if (stopped) return;
        if (tokenRef.current !== activeToken || userIdRef.current !== viewerId) {
          console.log('[result-poll-skip]', { reason: 'auth-changed' });
          return;
        }

        if (!result?.id) {
          console.log('[result-poll-empty]');
          return;
        }

        const decision = resultShowDecision(result, viewerId, 'auto');
        if (!decision.shouldShow) {
          console.log('[result-poll-skip]', {
            reason: decision.reason,
            banId: result.id,
          });
          return;
        }

        console.log('[result-poll-hit]', { banId: result.id });
        receiveResult(result, 'poll');
      } catch {
        console.log('[result-poll-skip]', { reason: 'request-failed' });
      } finally {
        inFlight = false;
      }
    };

    console.log('[result-poll-start]', { userId });
    void tick();
    const timer = window.setInterval(() => void tick(), RESULT_POLL_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId, token, receiveResult, getOpenResult, userIdRef, tokenRef]);
}
