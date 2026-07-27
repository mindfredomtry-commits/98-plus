'use client';

import type { BanInteraction } from '@98plus/shared';
import { normalizeId } from '@/lib/normalize-json';
import type { NotificationOwnerDisplayState } from '@/lib/notification-overlay-owner';
import {
  logOwnerPhase11B4ReplyMismatch,
  logOwnerPhase11B4ReplyRead,
} from '@/lib/notification-overlay-owner-debug';

export type OwnerReplyIncomingReadSelector =
  | 'replyIncomingBan'
  | 'incomingCardDisplayBan'
  | 'replyDirectOverlayBan'
  | 'showReplyIncomingOverlayDirect'
  | 'replyIncomingOverlayBlockReason'
  | 'notificationOverlayVisible'
  | 'GlobalOverlayHost'
  | 'NotificationQueueShell'
  | 'IncomingBanOverlay';

type LegacyReplyIncomingCompare = {
  ref: BanInteraction | null;
  state: BanInteraction | null;
};

function replyBanId(ban: BanInteraction | null | undefined): string | null {
  if (!ban?.id) return null;
  return normalizeId(ban.id) || null;
}

function compareReplyIds11B4(
  selector: OwnerReplyIncomingReadSelector,
  ownerBan: BanInteraction | null,
  legacyBan: BanInteraction | null,
): void {
  const ownerId = replyBanId(ownerBan);
  const legacyId = replyBanId(legacyBan);
  if (ownerId === legacyId) return;
  logOwnerPhase11B4ReplyMismatch({
    selector,
    ownerBanId: ownerId,
    legacyBanId: legacyId,
  });
}

/** Phase 11B.4: owner-only reply incoming display read — legacy args used for mismatch logging only. */
export function readOwnerOnlyReplyIncomingBan(
  display: NotificationOwnerDisplayState,
  selector: OwnerReplyIncomingReadSelector,
  legacy?: LegacyReplyIncomingCompare,
): BanInteraction | null {
  const ownerBan = display.replyIncomingBan?.id ? display.replyIncomingBan : null;
  logOwnerPhase11B4ReplyRead({
    selector,
    banId: ownerBan?.id ?? null,
  });
  if (legacy) {
    const legacyBan = legacy.state ?? legacy.ref ?? null;
    compareReplyIds11B4(selector, ownerBan, legacyBan);
  }
  return ownerBan;
}
