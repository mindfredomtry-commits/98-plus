import type { BanInteraction, BanResult } from '@98plus/shared';
import { api } from './api';

export type PendingChainPrefetch = {
  incoming: BanInteraction[];
  check: BanInteraction | null;
  result: BanResult | null;
};

export async function fetchPendingChainPrefetch(
  token: string,
): Promise<PendingChainPrefetch> {
  const [incomingRes, checkRes, resultRes] = await Promise.all([
    api<{ bans: BanInteraction[] }>('/bans/incoming/pending-all', { token }).catch(
      () => ({ bans: [] as BanInteraction[] }),
    ),
    api<{ ban: BanInteraction | null }>('/bans/check/pending', { token }).catch(
      () => ({ ban: null as BanInteraction | null }),
    ),
    api<{ result: BanResult | null }>('/bans/result/pending', { token }).catch(
      () => ({ result: null as BanResult | null }),
    ),
  ]);

  return {
    incoming: Array.isArray(incomingRes.bans) ? incomingRes.bans : [],
    check: checkRes.ban ?? null,
    result: resultRes.result ?? null,
  };
}
