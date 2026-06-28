'use client';

import type { HeldUserCardOverlay } from '@/lib/overlay-user-card-guard';
import { heldUserCardBanId } from '@/lib/overlay-user-card-guard';
import {
  logOwnerPhase11B2HeldMismatch,
  logOwnerPhase11B2HeldRead,
} from '@/lib/notification-overlay-owner-debug';

export type OwnerHeldReadSelector =
  | 'heldUserCard'
  | 'buildResultShellHeldCardGuardContext'
  | 'incomingCardDisplayBan'
  | 'activeResultPayload'
  | 'effectiveNotificationQueueShellKind'
  | 'incomingNotificationShellKind'
  | 'notificationOverlayVisible'
  | 'activeOverlayKind'
  | 'GlobalOverlayHost'
  | 'NotificationQueueShell';

type LegacyHeldCompare = {
  ref: HeldUserCardOverlay | null;
  state: HeldUserCardOverlay | null;
};

function heldBanId(held: HeldUserCardOverlay | null | undefined): string | null {
  if (!held) return null;
  return heldUserCardBanId(held);
}

function compareHeldIds10B2(
  selector: OwnerHeldReadSelector,
  ownerHeld: HeldUserCardOverlay | null,
  legacyHeld: HeldUserCardOverlay | null,
): void {
  const ownerKind = ownerHeld?.kind ?? null;
  const legacyKind = legacyHeld?.kind ?? null;
  const ownerBanId = heldBanId(ownerHeld);
  const legacyBanId = heldBanId(legacyHeld);
  if (ownerKind === legacyKind && ownerBanId === legacyBanId) return;
  logOwnerPhase11B2HeldMismatch({
    selector,
    ownerKind,
    ownerBanId,
    legacyKind,
    legacyBanId,
  });
}

/** Phase 11B.2: owner-only held user card read — legacy args used for mismatch logging only. */
export function readOwnerOnlyUserCard(
  ownerUserCard: HeldUserCardOverlay | null,
  selector: OwnerHeldReadSelector,
  legacy?: LegacyHeldCompare,
): HeldUserCardOverlay | null {
  logOwnerPhase11B2HeldRead({
    selector,
    kind: ownerUserCard?.kind ?? null,
    banId: heldBanId(ownerUserCard),
  });
  if (legacy) {
    const legacyHeld = legacy.state ?? legacy.ref ?? null;
    compareHeldIds10B2(selector, ownerUserCard, legacyHeld);
  }
  return ownerUserCard;
}
