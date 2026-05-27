import { isIncomingOverlayBan, type BanInteraction } from '@98plus/shared';

/** Incoming modal requires pending incoming challenge for the receiver. */
export function isValidIncomingOverlayPayload(
  ban: BanInteraction | null | undefined,
  viewerId?: string | null,
): boolean {
  if (!ban?.id?.trim()) return false;
  if (!ban.text?.trim()) return false;
  if (!ban.sender?.id || !ban.receiver?.id) return false;
  if (!isIncomingOverlayBan(ban)) return false;
  if (viewerId && viewerId !== ban.receiver.id) return false;
  if (ban.incomingAcknowledged) return false;
  return true;
}

/**
 * Minimal guard — show incoming modal as soon as auth user matches receiver.
 * Does not wait for friends, avatars, session sync, or dataOwner.
 */
export function shouldShowIncomingBanModal(
  ban: BanInteraction | null | undefined,
  viewerId: string | null | undefined,
  sessionDismissed: ReadonlySet<string>,
): boolean {
  if (!viewerId) return false;
  if (!ban?.id?.trim() || !ban.text?.trim()) return false;
  if (!ban.receiver?.id) return false;
  if (ban.receiver.id !== viewerId) return false;
  if (ban.status !== 'pending') return false;
  if (ban.incomingAcknowledged) return false;
  if (sessionDismissed.has(ban.id)) return false;
  return true;
}
