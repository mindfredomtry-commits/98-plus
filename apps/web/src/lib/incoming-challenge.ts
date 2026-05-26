import { isIncomingOverlayBan, type BanInteraction } from '@98plus/shared';
import { isIncomingAcknowledgedLocally } from './acknowledged-incoming';

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
  return true;
}

/** Whether the incoming notification modal should auto-open for this viewer. */
export function shouldShowIncomingBanModal(
  ban: BanInteraction | null | undefined,
  viewerId: string | null | undefined,
  sessionDismissed: ReadonlySet<string>,
): boolean {
  if (!isValidIncomingOverlayPayload(ban, viewerId)) return false;
  if (sessionDismissed.has(ban!.id)) return false;
  if (isIncomingAcknowledgedLocally(ban!.id)) return false;
  return true;
}
