'use client';

import type { BanInteraction } from '@98plus/shared';
import { normalizeId } from '@/lib/normalize-json';
import type { NotificationOwnerDisplayState } from '@/lib/notification-overlay-owner';
import {
  logOwnerPhase11B3StableMismatch,
  logOwnerPhase11B3StableRead,
} from '@/lib/notification-overlay-owner-debug';

export type OwnerStableIncomingReadSelector =
  | 'stableIncomingBan'
  | 'incomingCardDisplayBan'
  | 'shouldRenderIncomingOverlay'
  | 'incomingNotificationShellKind'
  | 'notificationOverlayVisible'
  | 'shouldMountNotificationOverlayHost'
  | 'notificationQueueShellIncomingCardReady'
  | 'GlobalOverlayHost'
  | 'NotificationQueueShell'
  | 'IncomingBanOverlay'
  | 'incomingJsxRender';

type LegacyStableIncomingCompare = {
  ref: BanInteraction | null;
  state: BanInteraction | null;
};

function stableBanId(ban: BanInteraction | null | undefined): string | null {
  if (!ban?.id) return null;
  return normalizeId(ban.id) || null;
}

function compareStableIds11B3(
  selector: OwnerStableIncomingReadSelector,
  ownerBan: BanInteraction | null,
  legacyBan: BanInteraction | null,
): void {
  const ownerId = stableBanId(ownerBan);
  const legacyId = stableBanId(legacyBan);
  if (ownerId === legacyId) return;
  logOwnerPhase11B3StableMismatch({
    selector,
    ownerBanId: ownerId,
    legacyBanId: legacyId,
  });
}

/** Phase 11B.3: owner-only stable incoming read — legacy args used for mismatch logging only. */
export function readOwnerOnlyStableIncomingBan(
  display: NotificationOwnerDisplayState,
  selector: OwnerStableIncomingReadSelector,
  legacy?: LegacyStableIncomingCompare,
): BanInteraction | null {
  const ownerBan = display.stableIncomingBan?.id
    ? display.stableIncomingBan
    : null;
  logOwnerPhase11B3StableRead({
    selector,
    banId: ownerBan?.id ?? null,
  });
  if (legacy) {
    const legacyBan = legacy.state ?? legacy.ref ?? null;
    compareStableIds11B3(selector, ownerBan, legacyBan);
  }
  return ownerBan;
}
