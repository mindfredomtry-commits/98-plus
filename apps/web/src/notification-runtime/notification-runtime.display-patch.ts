/**
 * Vertical 9 — active display patch shape.
 *
 * Owned by notification-runtime. Legacy dual-store/shadow owner modules are
 * deleted; this type has no relationship to any shadow/mirror state machine.
 */
import type { BanInteraction, BanResult } from '@98plus/shared';

export type OwnerActiveDisplayPatch = {
  incomingBan?: BanInteraction | null;
  stableIncomingBan?: BanInteraction | null;
  replyIncomingBan?: BanInteraction | null;
  scopedIncomingBan?: BanInteraction | null;
  checkBan?: BanInteraction | null;
  result?: BanResult | null;
  directResultOverlay?: boolean;
  directResultOverlayActive?: boolean;
};
