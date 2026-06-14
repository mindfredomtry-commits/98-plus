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
  deeplinkBanId?: string | null,
): ReplyDeeplinkEntry {
  const viewer = viewerId?.trim() ?? '';
  if (!viewer) {
    console.log('[reply-guard-resolve]', {
      viewerId: null,
      banId: ban.id ?? null,
      deeplinkBanId: deeplinkBanId ?? null,
      banStatus: ban.status,
      storedResult: null,
      decision: 'reject',
    });
    return 'reject';
  }

  const storageBanId = (deeplinkBanId ?? ban.id)?.trim() ?? '';
  const stored = storageBanId
    ? getReplyDeeplinkActionResult(viewer, storageBanId)
    : null;

  if (stored === 'reply_ban_overboard') {
    console.log('[reply-guard-resolve]', {
      viewerId: viewer,
      banId: ban.id ?? null,
      deeplinkBanId: storageBanId || null,
      banStatus: ban.status,
      storedResult: stored,
      decision: 'lobby_overboard',
    });
    return 'lobby_overboard';
  }
  if (stored === 'reply_ban_sent') {
    console.log('[reply-guard-resolve]', {
      viewerId: viewer,
      banId: ban.id ?? null,
      deeplinkBanId: storageBanId || null,
      banStatus: ban.status,
      storedResult: stored,
      decision: 'lobby_sent',
    });
    return 'lobby_sent';
  }

  if (!storageBanId) {
    if (!ban.receiver?.id || ban.receiver.id !== viewer) {
      console.log('[reply-guard-resolve]', {
        viewerId: viewer,
        banId: ban.id ?? null,
        deeplinkBanId: null,
        banStatus: ban.status,
        storedResult: null,
        decision: 'reject',
      });
      return 'reject';
    }
    if (ban.status !== 'pending') {
      console.log('[reply-guard-resolve]', {
        viewerId: viewer,
        banId: ban.id ?? null,
        deeplinkBanId: null,
        banStatus: ban.status,
        storedResult: null,
        decision: 'reject',
      });
      return 'reject';
    }
    if (!ban.text?.trim() || !ban.sender?.id) {
      console.log('[reply-guard-resolve]', {
        viewerId: viewer,
        banId: ban.id ?? null,
        deeplinkBanId: null,
        banStatus: ban.status,
        storedResult: null,
        decision: 'reject',
      });
      return 'reject';
    }
    console.log('[reply-guard-resolve]', {
      viewerId: viewer,
      banId: ban.id ?? null,
      deeplinkBanId: null,
      banStatus: ban.status,
      storedResult: null,
      decision: 'open_card',
    });
    return 'open_card';
  }

  if (ban.status === 'overboard') {
    markReplyDeeplinkOverboard(viewer, storageBanId);
    console.log('[reply-guard-resolve]', {
      viewerId: viewer,
      banId: ban.id ?? null,
      deeplinkBanId: storageBanId,
      banStatus: ban.status,
      storedResult: null,
      decision: 'lobby_overboard',
    });
    return 'lobby_overboard';
  }
  if (ban.status === 'replied' || ban.status === 'countered') {
    markReplyDeeplinkSent(viewer, storageBanId);
    console.log('[reply-guard-resolve]', {
      viewerId: viewer,
      banId: ban.id ?? null,
      deeplinkBanId: storageBanId,
      banStatus: ban.status,
      storedResult: null,
      decision: 'lobby_sent',
    });
    return 'lobby_sent';
  }

  if (!ban.receiver?.id || ban.receiver.id !== viewer) {
    console.log('[reply-guard-resolve]', {
      viewerId: viewer,
      banId: ban.id ?? null,
      deeplinkBanId: storageBanId,
      banStatus: ban.status,
      storedResult: null,
      decision: 'reject',
    });
    return 'reject';
  }
  if (ban.status !== 'pending') {
    console.log('[reply-guard-resolve]', {
      viewerId: viewer,
      banId: ban.id ?? null,
      deeplinkBanId: storageBanId,
      banStatus: ban.status,
      storedResult: null,
      decision: 'reject',
    });
    return 'reject';
  }
  if (!ban.text?.trim() || !ban.sender?.id) {
    console.log('[reply-guard-resolve]', {
      viewerId: viewer,
      banId: ban.id ?? null,
      deeplinkBanId: storageBanId,
      banStatus: ban.status,
      storedResult: null,
      decision: 'reject',
    });
    return 'reject';
  }

  console.log('[reply-guard-resolve]', {
    viewerId: viewer,
    banId: ban.id ?? null,
    deeplinkBanId: storageBanId,
    banStatus: ban.status,
    storedResult: null,
    decision: 'open_card',
  });
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
  const bid = banId.trim();
  const viewer = viewerId.trim();
  if (!bid || !viewer) return;
  if (getReplyDeeplinkActionResult(viewer, bid)) return;

  opts.dismissedIncoming.delete(bid);
  opts.consumedAfterAnswer.delete(bid);
  opts.locallyAckedIncoming.delete(bid);
  opts.replyComposeDismissed.delete(bid);
  opts.fastOpenedRef.current = false;
}
