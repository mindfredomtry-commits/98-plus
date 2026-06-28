'use client';

import type { BanInteraction, BanResult } from '@98plus/shared';
import type { QueuedOverlay } from '@/lib/overlay-queue';
import { overlayBanId } from '@/lib/overlay-queue';
import { normalizeId } from '@/lib/normalize-json';
import type {
  NotificationOverlayOwnerState,
  NotificationOwnerDisplayState,
} from '@/lib/notification-overlay-owner';
import { logPhase12LegacyFallbackRemoval } from '@/lib/notification-overlay-owner-phase12-legacy-fallback-removal-debug';
import {
  readOwnerImperativeCheckBan,
  readOwnerImperativeIncomingBan,
  readOwnerImperativeQueueHead,
  readOwnerImperativeResult,
  type OwnerImperativeReadSelector,
} from '@/lib/notification-overlay-owner-imperative-read-selectors';
import {
  readOwnerC2DisplayIncomingBan,
  readOwnerC2DisplayResultBanId,
  readOwnerC3DisplayIncomingBan,
  readOwnerC3DisplayResult,
  readOwnerC3DisplayResultBanId,
  readOwnerDecisionDisplayCheckBan,
  readOwnerDecisionDisplayIncomingBan,
  readOwnerDecisionDisplayResultBanId,
  readOwnerImperativeCheckAnswerWaitingHoldBanId,
  type OwnerC2DecisionReadSelector,
  type OwnerC3DecisionReadSelector,
  type OwnerChainReadSelector,
  type OwnerDecisionReadSelector,
} from '@/lib/notification-overlay-owner-chain-read-selectors';

function normId(value: string | null | undefined): string | null {
  if (!value) return null;
  return normalizeId(value) || null;
}

function idsMismatch(
  owner: string | null | undefined,
  legacy: string | null | undefined,
): boolean {
  return normId(owner) !== normId(legacy);
}

function banIdOf(ban: BanInteraction | null | undefined): string | null {
  return ban?.id ? normId(ban.id) : null;
}

function resultIdOf(result: BanResult | null | undefined): string | null {
  return result?.id ? normId(result.id) : null;
}

function queueHeadSnapshot(item: QueuedOverlay | null | undefined): {
  kind: string | null;
  banId: string | null;
} | null {
  if (!item) return null;
  return {
    kind: item.kind ?? null,
    banId: normId(overlayBanId(item)),
  };
}

function queueHeadMismatch(
  owner: QueuedOverlay | null,
  legacy: QueuedOverlay | null,
): boolean {
  const o = queueHeadSnapshot(owner);
  const l = queueHeadSnapshot(legacy);
  if (!o && !l) return false;
  if (!o || !l) return true;
  return o.kind !== l.kind || o.banId !== l.banId;
}

function logRemoval(
  source: string,
  ownerValue: unknown,
  legacyWouldValue: unknown,
): void {
  const mismatch =
    ownerValue !== legacyWouldValue &&
    JSON.stringify(ownerValue) !== JSON.stringify(legacyWouldValue);
  logPhase12LegacyFallbackRemoval({
    source,
    ownerValue,
    legacyWouldValue,
    runtimeUsed: 'owner',
    mismatch,
  });
}

/** Phase 12.3B: imperative queue head — owner-only runtime. */
export function readOwnerImperativeQueueHeadForRuntime(
  owner: NotificationOverlayOwnerState,
  selector: OwnerImperativeReadSelector,
  legacy: { queueRef?: readonly QueuedOverlay[] },
): QueuedOverlay | null {
  const ownerValue = readOwnerImperativeQueueHead(owner, selector, legacy);
  const legacyWouldValue = legacy.queueRef?.[0] ?? null;
  if (queueHeadMismatch(ownerValue, legacyWouldValue)) {
    logRemoval(selector, queueHeadSnapshot(ownerValue), queueHeadSnapshot(legacyWouldValue));
  }
  return ownerValue;
}

/** Phase 12.3B: imperative incoming ban — owner-only runtime. */
export function readOwnerImperativeIncomingBanForRuntime(
  display: NotificationOwnerDisplayState,
  selector: OwnerImperativeReadSelector,
  legacy: { ref?: BanInteraction | null },
): BanInteraction | null {
  const ownerValue = readOwnerImperativeIncomingBan(display, selector, legacy);
  const legacyWouldValue = legacy.ref ?? null;
  if (idsMismatch(banIdOf(ownerValue), banIdOf(legacyWouldValue))) {
    logRemoval(selector, banIdOf(ownerValue), banIdOf(legacyWouldValue));
  }
  return ownerValue;
}

/** Phase 12.3B: imperative check ban — owner-only runtime. */
export function readOwnerImperativeCheckBanForRuntime(
  display: NotificationOwnerDisplayState,
  selector: OwnerImperativeReadSelector,
  legacy: { ref?: BanInteraction | null },
): BanInteraction | null {
  const ownerValue = readOwnerImperativeCheckBan(display, selector, legacy);
  const legacyWouldValue = legacy.ref ?? null;
  if (idsMismatch(banIdOf(ownerValue), banIdOf(legacyWouldValue))) {
    logRemoval(selector, banIdOf(ownerValue), banIdOf(legacyWouldValue));
  }
  return ownerValue;
}

/** Phase 12.3B: imperative result — owner-only runtime. */
export function readOwnerImperativeResultForRuntime(
  display: NotificationOwnerDisplayState,
  selector: OwnerImperativeReadSelector,
  legacy: { ref?: BanResult | null },
): BanResult | null {
  const ownerValue = readOwnerImperativeResult(display, selector, legacy);
  const legacyWouldValue = legacy.ref ?? null;
  if (idsMismatch(resultIdOf(ownerValue), resultIdOf(legacyWouldValue))) {
    logRemoval(selector, resultIdOf(ownerValue), resultIdOf(legacyWouldValue));
  }
  return ownerValue;
}

/** Phase 12.3B: check-answer waiting hold ban id — owner-only runtime. */
export function readOwnerImperativeCheckAnswerWaitingHoldBanIdForRuntime(
  owner: NotificationOverlayOwnerState,
  selector: OwnerChainReadSelector,
  legacy: { ref?: string | null },
): string | null {
  const ownerValue = readOwnerImperativeCheckAnswerWaitingHoldBanId(
    owner,
    selector,
    legacy,
  );
  const legacyWouldValue = legacy.ref ? normId(legacy.ref) : null;
  if (idsMismatch(ownerValue, legacyWouldValue)) {
    logRemoval(selector, ownerValue, legacyWouldValue);
  }
  return ownerValue;
}

/** Phase 12.3B: decision display incoming — owner-only runtime. */
export function readOwnerDecisionDisplayIncomingBanForRuntime(
  display: NotificationOwnerDisplayState,
  selector: OwnerDecisionReadSelector,
  legacy: { ref?: BanInteraction | null; state?: BanInteraction | null },
): BanInteraction | null {
  const ownerValue = readOwnerDecisionDisplayIncomingBan(display, selector, legacy);
  const legacyWouldValue = legacy.state ?? legacy.ref ?? null;
  if (idsMismatch(banIdOf(ownerValue), banIdOf(legacyWouldValue))) {
    logRemoval(selector, banIdOf(ownerValue), banIdOf(legacyWouldValue));
  }
  return ownerValue;
}

/** Phase 12.3B: decision display check — owner-only runtime. */
export function readOwnerDecisionDisplayCheckBanForRuntime(
  display: NotificationOwnerDisplayState,
  selector: OwnerDecisionReadSelector,
  legacy: { ref?: BanInteraction | null; state?: BanInteraction | null },
): BanInteraction | null {
  const ownerValue = readOwnerDecisionDisplayCheckBan(display, selector, legacy);
  const legacyWouldValue = legacy.state ?? legacy.ref ?? null;
  if (idsMismatch(banIdOf(ownerValue), banIdOf(legacyWouldValue))) {
    logRemoval(selector, banIdOf(ownerValue), banIdOf(legacyWouldValue));
  }
  return ownerValue;
}

/** Phase 12.3B: decision display result ban id — owner-only runtime. */
export function readOwnerDecisionDisplayResultBanIdForRuntime(
  display: NotificationOwnerDisplayState,
  selector: OwnerDecisionReadSelector,
  legacy: {
    ref?: BanInteraction | BanResult | null;
    state?: BanInteraction | null;
    resultRef?: BanResult | null;
  },
): string | null {
  const ownerValue = readOwnerDecisionDisplayResultBanId(display, selector, legacy);
  const legacyWouldValue =
    legacy.resultRef?.id ??
    (legacy.ref as BanResult | null | undefined)?.id ??
    legacy.state?.id ??
    null;
  const legacyNorm = legacyWouldValue ? normId(legacyWouldValue) : null;
  if (idsMismatch(ownerValue, legacyNorm)) {
    logRemoval(selector, ownerValue, legacyNorm);
  }
  return ownerValue;
}

/** Phase 12.3B: C2 display incoming — owner-only runtime. */
export function readOwnerC2DisplayIncomingBanForRuntime(
  display: NotificationOwnerDisplayState,
  selector: OwnerC2DecisionReadSelector,
  legacy: { ref?: BanInteraction | null; state?: BanInteraction | null },
): BanInteraction | null {
  const ownerValue = readOwnerC2DisplayIncomingBan(display, selector, legacy);
  const legacyWouldValue = legacy.state ?? legacy.ref ?? null;
  if (idsMismatch(banIdOf(ownerValue), banIdOf(legacyWouldValue))) {
    logRemoval(selector, banIdOf(ownerValue), banIdOf(legacyWouldValue));
  }
  return ownerValue;
}

/** Phase 12.3B: C2 display result ban id — owner-only runtime. */
export function readOwnerC2DisplayResultBanIdForRuntime(
  display: NotificationOwnerDisplayState,
  selector: OwnerC2DecisionReadSelector,
  legacy: {
    ref?: BanInteraction | BanResult | null;
    state?: BanInteraction | null;
    resultRef?: BanResult | null;
  },
): string | null {
  const ownerValue = readOwnerC2DisplayResultBanId(display, selector, legacy);
  const legacyWouldValue =
    legacy.resultRef?.id ??
    (legacy.ref as BanResult | null | undefined)?.id ??
    legacy.state?.id ??
    null;
  const legacyNorm = legacyWouldValue ? normId(legacyWouldValue) : null;
  if (idsMismatch(ownerValue, legacyNorm)) {
    logRemoval(selector, ownerValue, legacyNorm);
  }
  return ownerValue;
}

/** Phase 12.3B: C3 display incoming — owner-only runtime. */
export function readOwnerC3DisplayIncomingBanForRuntime(
  display: NotificationOwnerDisplayState,
  selector: OwnerC3DecisionReadSelector,
  legacy: { ref?: BanInteraction | null; state?: BanInteraction | null },
): BanInteraction | null {
  const ownerValue = readOwnerC3DisplayIncomingBan(display, selector, legacy);
  const legacyWouldValue = legacy.state ?? legacy.ref ?? null;
  if (idsMismatch(banIdOf(ownerValue), banIdOf(legacyWouldValue))) {
    logRemoval(selector, banIdOf(ownerValue), banIdOf(legacyWouldValue));
  }
  return ownerValue;
}

/** Phase 12.3B: C3 display result ban id — owner-only runtime. */
export function readOwnerC3DisplayResultBanIdForRuntime(
  display: NotificationOwnerDisplayState,
  selector: OwnerC3DecisionReadSelector,
  legacy: {
    ref?: BanInteraction | BanResult | null;
    state?: BanInteraction | null;
    resultRef?: BanResult | null;
  },
): string | null {
  const ownerValue = readOwnerC3DisplayResultBanId(display, selector, legacy);
  const legacyWouldValue =
    legacy.resultRef?.id ??
    (legacy.ref as BanResult | null | undefined)?.id ??
    legacy.state?.id ??
    null;
  const legacyNorm = legacyWouldValue ? normId(legacyWouldValue) : null;
  if (idsMismatch(ownerValue, legacyNorm)) {
    logRemoval(selector, ownerValue, legacyNorm);
  }
  return ownerValue;
}

/** Phase 12.3B: C3 display result payload — owner-only runtime. */
export function readOwnerC3DisplayResultForRuntime(
  display: NotificationOwnerDisplayState,
  selector: OwnerC3DecisionReadSelector,
  legacy: {
    ref?: BanResult | null;
    resultRef?: BanResult | null;
  },
): BanResult | null {
  const ownerValue = readOwnerC3DisplayResult(display, selector, legacy);
  const legacyWouldValue = legacy.resultRef ?? legacy.ref ?? null;
  if (idsMismatch(resultIdOf(ownerValue), resultIdOf(legacyWouldValue))) {
    logRemoval(selector, resultIdOf(ownerValue), resultIdOf(legacyWouldValue));
  }
  return ownerValue;
}
