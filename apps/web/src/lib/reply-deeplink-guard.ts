import type { BanInteraction } from '@98plus/shared';
import {
  getReplyDeeplinkActionResult,
  markReplyDeeplinkOverboard,
  markReplyDeeplinkSent,
} from './reply-deeplink-action-result';

export type ReplyDeeplinkEntry =
  | 'open_card'
  | 'lobby_overboard'
  | 'lobby_sent'
  | 'reject';

export function resolveReplyDeeplinkEntry(
  ban: Pick<BanInteraction, 'id' | 'status' | 'receiver' | 'text' | 'sender'>,
  viewerId: string | null | undefined,
): ReplyDeeplinkEntry {
  if (!viewerId) return 'reject';

  const banId = ban.id?.trim() ?? '';
  if (!banId) {
    if (!ban.receiver?.id || ban.receiver.id !== viewerId) return 'reject';
    if (ban.status !== 'pending') return 'reject';
    if (!ban.text?.trim() || !ban.sender?.id) return 'reject';
    return 'open_card';
  }

  const stored = getReplyDeeplinkActionResult(viewerId, banId);
  if (stored === 'reply_ban_overboard') return 'lobby_overboard';
  if (stored === 'reply_ban_sent') return 'lobby_sent';

  if (ban.status === 'overboard') {
    markReplyDeeplinkOverboard(viewerId, banId);
    return 'lobby_overboard';
  }
  if (ban.status === 'replied' || ban.status === 'countered') {
    markReplyDeeplinkSent(viewerId, banId);
    return 'lobby_sent';
  }

  if (!ban.receiver?.id || ban.receiver.id !== viewerId) return 'reject';
  if (ban.status !== 'pending') return 'reject';
  if (!ban.text?.trim() || !ban.sender?.id) return 'reject';

  return 'open_card';
}

export function prepareReplyDeeplinkReopen(
  banId: string,
  viewerId: string,
  opts: {
    dismissedIncoming: Set<string>;
    consumedAfterAnswer: Set<string>;
    locallyAckedIncoming: Set<string>;
    replyComposeDismissed: Set<string>;
    fastOpenedRef: { current: boolean };
  },
): void {
  if (!banId.trim() || !viewerId.trim()) return;
  if (getReplyDeeplinkActionResult(viewerId, banId)) return;

  opts.dismissedIncoming.delete(banId);
  opts.consumedAfterAnswer.delete(banId);
  opts.locallyAckedIncoming.delete(banId);
  opts.replyComposeDismissed.delete(banId);
  opts.fastOpenedRef.current = false;
}
