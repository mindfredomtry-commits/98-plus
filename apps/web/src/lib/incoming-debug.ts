import type { BanInteraction } from '@98plus/shared';
import { isIncomingAcknowledgedLocally } from './acknowledged-incoming';
import { isIncomingOverlayBan } from '@98plus/shared';

export type IncomingHideReason =
  | 'shown'
  | 'no-auth-user'
  | 'auth-loading'
  | 'owner-not-ready'
  | 'no-incoming'
  | 'receiver-mismatch'
  | 'already-acked-server'
  | 'already-acked-local'
  | 'session-dismissed'
  | 'invalid-payload'
  | 'stale-session-discarded';

export function explainIncomingHidden(
  ban: BanInteraction | null | undefined,
  authUserId: string | null | undefined,
  authLoading: boolean,
  _dataOwnerUserId: string | null | undefined,
  sessionDismissed: ReadonlySet<string>,
): { shouldShow: boolean; reason: IncomingHideReason } {
  if (authLoading) return { shouldShow: false, reason: 'auth-loading' };
  if (!authUserId) return { shouldShow: false, reason: 'no-auth-user' };
  if (!ban?.id?.trim() || !ban.text?.trim()) {
    return { shouldShow: false, reason: 'no-incoming' };
  }
  if (!ban.sender?.id || !ban.receiver?.id) {
    return { shouldShow: false, reason: 'invalid-payload' };
  }
  if (!isIncomingOverlayBan(ban)) {
    return { shouldShow: false, reason: 'invalid-payload' };
  }
  if (ban.receiver.id !== authUserId) {
    return { shouldShow: false, reason: 'receiver-mismatch' };
  }
  if (ban.incomingAcknowledged) {
    return { shouldShow: false, reason: 'already-acked-server' };
  }
  if (sessionDismissed.has(ban.id)) {
    return { shouldShow: false, reason: 'session-dismissed' };
  }
  if (isIncomingAcknowledgedLocally(authUserId, ban.id)) {
    return {
      shouldShow: true,
      reason: 'shown',
    };
  }
  return { shouldShow: true, reason: 'shown' };
}

export function logIncomingDebug(payload: {
  authUserId: string | null | undefined;
  sessionUserId?: string | null;
  incomingId?: string | null;
  incomingReceiverId?: string | null;
  incomingAcknowledged?: boolean | null;
  shouldShow: boolean;
  reason: IncomingHideReason;
  extra?: Record<string, unknown>;
}) {
  console.log('[incoming-debug]', payload);
}
