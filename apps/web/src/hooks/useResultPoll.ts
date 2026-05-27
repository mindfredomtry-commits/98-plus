import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type { BanResult } from '@98plus/shared';
import { api } from '@/lib/api';

type ReceiveResult = (payload: BanResult, source: 'poll') => void;

type Params = {
  userId: string | undefined;
  token: string | null;
  receiveResult: ReceiveResult;
  getOpenResult: () => BanResult | null;
  userIdRef: MutableRefObject<string | null>;
  tokenRef: MutableRefObject<string | null>;
};

export function useResultPoll({
  userId,
  token,
  receiveResult,
  getOpenResult,
  userIdRef,
  tokenRef,
}: Params) {
  useEffect(() => {
    if (!userId || !token) {
      console.log('[result-poll-skip]', { reason: 'no-auth' });
      return;
    }
    console.log('[result-poll-start]', { userId });

    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      if (document.hidden) {
        console.log('[result-poll-skip]', { reason: 'hidden' });
        return;
      }
      const current = getOpenResult();
      if (current?.id) {
        console.log('[result-poll-skip]', {
          reason: 'already-open',
          banId: current.id,
        });
        return;
      }

      const requestUserId = userIdRef.current;
      const requestToken = tokenRef.current;
      if (!requestUserId || !requestToken) {
        console.log('[result-poll-skip]', { reason: 'missing-refs' });
        return;
      }

      try {
        const res = await api<{ result: BanResult | null }>('/bans/result/pending', {
          token: requestToken,
        });
        if (stopped) return;
        if (userIdRef.current !== requestUserId) return;
        if (tokenRef.current !== requestToken) return;

        if (res.result?.id) {
          console.log('[result-poll-hit]', {
            banId: res.result.id,
            authUserId: requestUserId,
          });
          receiveResult(res.result, 'poll');
        } else {
          console.log('[result-poll-empty]');
        }
      } catch {
        console.log('[result-poll-skip]', { reason: 'request-failed' });
      }
    };

    void tick();
    const id = window.setInterval(() => {
      void tick();
    }, 2500);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [userId, token, receiveResult, getOpenResult, userIdRef, tokenRef]);
}
