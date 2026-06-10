import type { BanInteraction, BanResult } from '@98plus/shared';
import {
  calcOverboardPenalty,
  isIncomingPairFunMode,
  RESULT_COPY,
} from '@98plus/shared';
import { enrichBanInteraction } from './user-public-avatar';

function resolveOptimisticOverboardEconomy(ban: BanInteraction): {
  funMode: boolean;
  economyMode: 'normal' | 'fun';
  pairBanCount24h: number | null;
  energy: { sender: number; receiver: number };
} {
  const incomingFunMode = isIncomingPairFunMode(ban);
  const pairBanCount24h = ban.pairBanCount24h ?? null;

  if (incomingFunMode) {
    return {
      funMode: true,
      economyMode: 'fun',
      pairBanCount24h,
      energy: { sender: 0, receiver: 0 },
    };
  }

  const penalty = calcOverboardPenalty();
  return {
    funMode: false,
    economyMode: 'normal',
    pairBanCount24h,
    energy: { sender: penalty.sender, receiver: penalty.receiver },
  };
}

function logOptimisticOverboard(
  banId: string,
  ban: BanInteraction,
  economy: ReturnType<typeof resolveOptimisticOverboardEconomy>,
  viewerId: string,
): void {
  const incomingFunMode = isIncomingPairFunMode(ban);
  const viewerDelta =
    viewerId === ban.sender?.id
      ? economy.energy.sender
      : viewerId === ban.receiver?.id
        ? economy.energy.receiver
        : null;
  console.log('[OPTIMISTIC OVERBOARD]');
  console.log('[OPTIMISTIC OVERBOARD] banId=', banId);
  console.log('[OPTIMISTIC OVERBOARD] pairBanCount24h=', ban.pairBanCount24h ?? '—');
  console.log('[OPTIMISTIC OVERBOARD] incomingFunMode=', incomingFunMode);
  console.log('[OPTIMISTIC OVERBOARD] optimisticFunMode=', economy.funMode);
  console.log('[OPTIMISTIC OVERBOARD] optimisticEnergy=', viewerDelta ?? '—');
}

/** Local overboard result card — shown before /overboard API resolves. */
export function buildOptimisticOverboardResult(
  ban: BanInteraction,
  viewerId: string,
): BanResult | null {
  const enriched = enrichBanInteraction(ban);
  const { sender, receiver } = enriched;
  if (!enriched.id?.trim() || !enriched.text?.trim()) return null;
  if (!sender?.id?.trim() || !receiver?.id?.trim()) return null;

  const economy = resolveOptimisticOverboardEconomy(enriched);
  logOptimisticOverboard(enriched.id, enriched, economy, viewerId);

  const copy = RESULT_COPY.overboard;
  const opponent =
    viewerId === sender.id
      ? receiver
      : viewerId === receiver.id
        ? sender
        : sender;

  return {
    id: enriched.id,
    text: enriched.text.trim(),
    outcome: 'overboard',
    headline: copy.headline,
    subline: copy.subline,
    sender,
    receiver,
    viewerId,
    opponent,
    confirmations: null,
    energy: economy.energy,
    farmSkipped: economy.funMode,
    funMode: economy.funMode,
    isFunMode: economy.funMode,
    economyMode: economy.economyMode,
    pairBanCount24h: economy.pairBanCount24h,
    completedAt: new Date().toISOString(),
    deepLink: '',
    shareLink: '',
    inviteOpponentLink: '',
  };
}
