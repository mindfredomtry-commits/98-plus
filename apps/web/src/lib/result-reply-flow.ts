import type { BanResult, UserPublic } from '@98plus/shared';

/** Other participant in the result pair — pre-selected for What reply. */
export function resolveResultReplyOpponent(result: BanResult): UserPublic | null {
  if (result.opponent?.id) return result.opponent;
  if (!result.viewerId) return null;
  if (result.viewerId === result.sender.id) return result.receiver;
  if (result.viewerId === result.receiver.id) return result.sender;
  return null;
}
