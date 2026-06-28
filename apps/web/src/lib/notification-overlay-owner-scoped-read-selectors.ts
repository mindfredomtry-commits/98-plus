'use client';

import type { BanInteraction } from '@98plus/shared';
import { normalizeId } from '@/lib/normalize-json';
import type { NotificationOwnerDisplayState } from '@/lib/notification-overlay-owner';
import {
  logOwnerPhase11B5ScopedMismatch,
  logOwnerPhase11B5ScopedRead,
} from '@/lib/notification-overlay-owner-debug';

export type OwnerScopedIncomingReadSelector =
  | 'scopedIncomingBan'
  | 'incomingCardDisplayBan'
  | 'effectiveScopedIncomingBan'
  | 'deepLinkSelectedBanId'
  | 'replyIncomingOverlayBlockReason'
  | 'notificationOverlayVisible'
  | 'GlobalOverlayHost'
  | 'NotificationQueueShell';

type LegacyScopedIncomingCompare = {
  ref: BanInteraction | null;
  state: BanInteraction | null;
};

function scopedBanId(ban: BanInteraction | null | undefined): string | null {
  if (!ban?.id) return null;
  return normalizeId(ban.id) || null;
}

function compareScopedIds11B5(
  selector: OwnerScopedIncomingReadSelector,
  ownerBan: BanInteraction | null,
  legacyBan: BanInteraction | null,
): void {
  const ownerId = scopedBanId(ownerBan);
  const legacyId = scopedBanId(legacyBan);
  if (ownerId === legacyId) return;
  logOwnerPhase11B5ScopedMismatch({
    selector,
    ownerBanId: ownerId,
    legacyBanId: legacyId,
  });
}

/** Phase 11B.5: owner-only scoped incoming read — legacy args used for mismatch logging only. */
export function readOwnerOnlyScopedIncomingBan(
  display: NotificationOwnerDisplayState,
  selector: OwnerScopedIncomingReadSelector,
  legacy?: LegacyScopedIncomingCompare,
): BanInteraction | null {
  const ownerBan = display.scopedIncomingBan?.id
    ? display.scopedIncomingBan
    : null;
  logOwnerPhase11B5ScopedRead({
    selector,
    banId: ownerBan?.id ?? null,
  });
  if (legacy) {
    const legacyBan = legacy.state ?? legacy.ref ?? null;
    compareScopedIds11B5(selector, ownerBan, legacyBan);
  }
  return ownerBan;
}
