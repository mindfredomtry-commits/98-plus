import type { BanInteraction, BanResult } from '@98plus/shared';
import { calcOverboardPenalty, RESULT_COPY } from '@98plus/shared';
import { enrichBanInteraction } from './user-public-avatar';

/** Local overboard result card — shown before /overboard API resolves. */
export function buildOptimisticOverboardResult(
  ban: BanInteraction,
  viewerId: string,
): BanResult | null {
  const enriched = enrichBanInteraction(ban);
  const { sender, receiver } = enriched;
  if (!enriched.id?.trim() || !enriched.text?.trim()) return null;
  if (!sender?.id?.trim() || !receiver?.id?.trim()) return null;

  const energy = calcOverboardPenalty();
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
    energy: { sender: energy.sender, receiver: energy.receiver },
    farmSkipped: false,
    funMode: false,
    economyMode: 'normal',
    pairBanCount24h: null,
    completedAt: new Date().toISOString(),
    deepLink: '',
    shareLink: '',
    inviteOpponentLink: '',
  };
}
