'use client';

import type { BanInteraction } from '@98plus/shared';
import type { QueuedOverlay } from '@/lib/overlay-queue';
import type { NotificationOwnerDisplayState } from '@/lib/notification-overlay-owner';
import { logPhase12RenderFallback } from '@/lib/notification-overlay-owner-phase12-render-debug';
import {
  readOwnerOnlyScopedIncomingBan,
  type OwnerScopedIncomingReadSelector,
} from '@/lib/notification-overlay-owner-scoped-read-selectors';
import {
  readOwnerOnlyShellQueueHeadKind,
  type OverlayShellKind,
  type OwnerShellReadSelector,
} from '@/lib/notification-overlay-owner-shell-read-selectors';

type LegacyQueueCompare = {
  queue: readonly QueuedOverlay[];
  refQueue: readonly QueuedOverlay[];
};

type LegacyScopedIncomingCompare = {
  ref: BanInteraction | null;
  state: BanInteraction | null;
};

function legacyQueueHeadKind(legacy: LegacyQueueCompare): OverlayShellKind {
  return legacy.queue[0]?.kind ?? legacy.refQueue[0]?.kind ?? null;
}

function legacyScopedIncomingBan(
  legacy: LegacyScopedIncomingCompare,
): BanInteraction | null {
  return legacy.state ?? legacy.ref ?? null;
}

/** Phase 12.1: owner-only shell queue head kind — legacy logged, never used for render. */
export function readOwnerShellQueueHeadKindForRender(
  ownerQueue: readonly QueuedOverlay[],
  legacy: LegacyQueueCompare,
  selector: OwnerShellReadSelector,
  suppressedReason: string,
): OverlayShellKind {
  const ownerKind = readOwnerOnlyShellQueueHeadKind(ownerQueue, selector, legacy);
  if (!ownerKind) {
    const wouldUseLegacy = legacyQueueHeadKind(legacy);
    if (wouldUseLegacy) {
      logPhase12RenderFallback({
        selector,
        field: 'queueHeadKind',
        reason: suppressedReason,
        wouldUseLegacy,
        ownerValue: null,
      });
    }
  }
  return ownerKind;
}

/** Phase 12.1: owner-only scoped incoming — legacy logged, never used for render. */
export function readOwnerScopedIncomingForRender(
  display: NotificationOwnerDisplayState,
  legacy: LegacyScopedIncomingCompare,
  selector: OwnerScopedIncomingReadSelector,
  suppressedReason: string,
): BanInteraction | null {
  const ownerBan = readOwnerOnlyScopedIncomingBan(display, selector, legacy);
  if (!ownerBan) {
    const wouldUseLegacy = legacyScopedIncomingBan(legacy);
    if (wouldUseLegacy?.id) {
      logPhase12RenderFallback({
        selector,
        field: 'scopedIncomingBan',
        reason: suppressedReason,
        wouldUseLegacyBanId: wouldUseLegacy.id,
        ownerValue: null,
      });
    }
  }
  return ownerBan;
}
