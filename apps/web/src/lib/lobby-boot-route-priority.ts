import type { BanInteraction, BanResult } from '@98plus/shared';
import { isDeepLinkRouteBootPending } from '@/lib/deep-link-route-boot';

/** Route/deeplink entry — boot is background placeholder only, not a gate. */
export type RouteOverlayBootPriorityInput = {
  replyDeepLinkBanId: string | null;
  checkDeepLinkBanId: string | null;
  replyDeeplinkFastShell: boolean;
  deepLinkReplyBooting: boolean;
  replyHandoffLock: boolean;
  replyUiShellActive: boolean;
  activeBanDeepLinkBanId: string | null;
  activeBanUiShellActive: boolean;
  incomingGateActive: boolean;
  checkGateActive: boolean;
  incomingCardFullyReady: boolean;
  incomingCardDisplayBan: BanInteraction | null;
  checkBan: BanInteraction | null;
  displayResult: BanResult | null;
  activeBanCardReady: boolean;
  showReplyIncomingOverlayDirect: boolean;
  /** Reply compose from incoming card — boot yields, overlay must not block What. */
  replyComposeActive: boolean;
};

export function isRouteOverlayEntryPending(
  input: Pick<
    RouteOverlayBootPriorityInput,
    | 'replyDeepLinkBanId'
    | 'checkDeepLinkBanId'
    | 'replyDeeplinkFastShell'
    | 'deepLinkReplyBooting'
    | 'replyHandoffLock'
    | 'replyUiShellActive'
    | 'activeBanDeepLinkBanId'
    | 'activeBanUiShellActive'
    | 'incomingGateActive'
    | 'checkGateActive'
  >,
): boolean {
  return (
    isDeepLinkRouteBootPending() ||
    input.checkDeepLinkBanId != null ||
    input.replyDeepLinkBanId != null ||
    input.replyDeeplinkFastShell ||
    input.deepLinkReplyBooting ||
    input.replyHandoffLock ||
    input.replyUiShellActive ||
    input.activeBanDeepLinkBanId != null ||
    input.activeBanUiShellActive ||
    input.incomingGateActive ||
    input.checkGateActive
  );
}

/** Card/overlay data is ready — show above boot immediately (do not wait for introFullyPrimed). */
export function isRouteOverlayReady(
  input: RouteOverlayBootPriorityInput,
): boolean {
  if (input.showReplyIncomingOverlayDirect && input.incomingCardDisplayBan) {
    return true;
  }
  if (input.incomingCardFullyReady && input.incomingGateActive) {
    return true;
  }
  if (input.checkGateActive && input.checkBan) {
    return true;
  }
  if (input.displayResult) {
    return true;
  }
  if (input.activeBanCardReady && input.activeBanDeepLinkBanId) {
    return true;
  }
  return false;
}

export function shouldBootYieldToRouteOverlay(
  input: RouteOverlayBootPriorityInput,
): boolean {
  if (input.replyComposeActive) return false;
  return isRouteOverlayEntryPending(input) && isRouteOverlayReady(input);
}
