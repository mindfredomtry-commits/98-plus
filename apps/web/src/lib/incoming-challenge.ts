import type { BanInteraction } from '@98plus/shared';
import { isIncomingOverlayBan } from '@98plus/shared';
import {
  isFreshIncomingForViewer,
  logIncomingDecision,
} from './incoming-fresh';

/** @deprecated Use isFreshIncomingForViewer — kept for deeplink validation */
export function isValidIncomingOverlayPayload(
  ban: BanInteraction | null | undefined,
  viewerId?: string | null,
): boolean {
  if (!ban?.id?.trim() || !ban.text?.trim()) return false;
  if (!ban.sender?.id || !ban.receiver?.id) return false;
  if (!isIncomingOverlayBan(ban)) return false;
  if (viewerId && viewerId !== ban.receiver.id) return false;
  if (ban.incomingAcknowledged) return false;
  return true;
}

/** @deprecated Use isFreshIncomingForViewer */
export function shouldShowIncomingBanModal(
  ban: BanInteraction | null | undefined,
  viewerId: string | null | undefined,
  sessionDismissed: ReadonlySet<string>,
): boolean {
  const show = isFreshIncomingForViewer(ban, viewerId, sessionDismissed);
  if (ban?.id) {
    logIncomingDecision(ban, viewerId, sessionDismissed);
  }
  return show;
}
