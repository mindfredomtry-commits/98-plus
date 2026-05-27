import type { BanInteraction } from '@98plus/shared';

export type IncomingBlockReason =
  | 'shown'
  | 'no-incoming'
  | 'no-viewer'
  | 'no-id'
  | 'no-text'
  | 'no-receiver'
  | 'receiver-mismatch'
  | 'status-not-pending'
  | 'server-acked'
  | 'session-dismissed';

/**
 * Single source of truth for showing the incoming ban overlay.
 * Nothing else may block fresh incoming except this guard.
 */
export function isFreshIncomingForViewer(
  incoming: BanInteraction | null | undefined,
  viewerId: string | null | undefined,
  sessionDismissedIncoming: ReadonlySet<string>,
): boolean {
  if (!viewerId || !incoming?.id?.trim()) return false;
  if (!incoming.text?.trim()) return false;
  if (!incoming.receiver?.id) return false;
  if (incoming.receiver.id !== viewerId) return false;
  if (incoming.status !== 'pending') return false;
  if (incoming.incomingAcknowledged) return false;
  if (sessionDismissedIncoming.has(incoming.id)) return false;
  return true;
}

export function explainIncomingBlock(
  incoming: BanInteraction | null | undefined,
  viewerId: string | null | undefined,
  sessionDismissedIncoming: ReadonlySet<string>,
): { shouldShow: boolean; reason: IncomingBlockReason } {
  if (!incoming?.id) {
    return { shouldShow: false, reason: 'no-incoming' };
  }
  if (!viewerId) {
    return { shouldShow: false, reason: 'no-viewer' };
  }
  if (!incoming.id.trim()) {
    return { shouldShow: false, reason: 'no-id' };
  }
  if (!incoming.text?.trim()) {
    return { shouldShow: false, reason: 'no-text' };
  }
  if (!incoming.receiver?.id) {
    return { shouldShow: false, reason: 'no-receiver' };
  }
  if (incoming.receiver.id !== viewerId) {
    return { shouldShow: false, reason: 'receiver-mismatch' };
  }
  if (incoming.status !== 'pending') {
    return { shouldShow: false, reason: 'status-not-pending' };
  }
  if (incoming.incomingAcknowledged) {
    return { shouldShow: false, reason: 'server-acked' };
  }
  if (sessionDismissedIncoming.has(incoming.id)) {
    return { shouldShow: false, reason: 'session-dismissed' };
  }
  return { shouldShow: true, reason: 'shown' };
}

export function logIncomingReceive(
  source: 'ws' | 'session' | 'boot' | 'buffer',
  incoming: BanInteraction,
  viewerId: string | null | undefined,
) {
  console.log('[incoming-receive]', {
    source,
    id: incoming.id,
    receiverId: incoming.receiver?.id ?? null,
    viewerId: viewerId ?? null,
    status: incoming.status,
    incomingAcknowledged: incoming.incomingAcknowledged ?? false,
  });
}

export function logIncomingRecoverySession(
  incoming: BanInteraction,
  viewerId: string,
  meta?: Record<string, unknown>,
) {
  console.log('[incoming-recovery-session]', {
    banId: incoming.id,
    viewerId,
    receiverId: incoming.receiver?.id ?? null,
    status: incoming.status,
    incomingAcknowledged: incoming.incomingAcknowledged ?? false,
    ...meta,
  });
}

export function logIncomingDecision(
  incoming: BanInteraction | null | undefined,
  viewerId: string | null | undefined,
  sessionDismissedIncoming: ReadonlySet<string>,
) {
  const { shouldShow, reason } = explainIncomingBlock(
    incoming,
    viewerId,
    sessionDismissedIncoming,
  );
  const payload = {
    id: incoming?.id ?? null,
    viewerId: viewerId ?? null,
    receiverId: incoming?.receiver?.id ?? null,
    shouldShow,
    reason,
  };
  if (shouldShow) {
    console.log('[incoming-decision]', payload);
  } else if (incoming?.id) {
    console.log('[incoming-blocked]', payload);
  }
  return { shouldShow, reason };
}
