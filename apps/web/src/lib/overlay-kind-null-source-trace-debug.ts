'use client';

import type { QueueLobbyGuardSnapshot } from '@/lib/queue-lobby-guard';
import {
  getLastKnownVisualQueueDimSessionLive,
  getQueueLobbyGuardSnapshot,
} from '@/lib/queue-lobby-guard';
import { readQueueHeadMutationContext } from '@/lib/queue-head-lifecycle-trace-debug';
import {
  diagTraceNow,
  emitClientDiagTrace,
  isClientDiagTraceEnvironment,
} from '@/lib/diag-trace-client';

export type OverlayKindNullSourceTrace = {
  timestamp: number;
  previousShellKind: string | null;
  previousActiveKind: string | null;
  previousEffectiveKind: string | null;
  nextShellKind: string | null;
  nextActiveKind: string | null;
  nextEffectiveKind: string | null;
  ownerQueueLen: number | null;
  ownerPendingLen: number | null;
  overlayQueueLength: number | null;
  queueHeadKind: string | null;
  resolvedShellQueueHead: string | null;
  notificationOverlayVisible: boolean | null;
  visualQueueDimSessionLive: boolean | null;
  resultOverlayMounted: boolean | null;
  checkOverlayMounted: boolean | null;
  incomingOverlayMounted: boolean | null;
  directOverboardMounted: boolean | null;
  mutationSource: string | null;
  mutationReason: string | null;
  dispatchSource: string | null;
  selectorSource: string | null;
  callSite: string;
  stack: string | null;
  guardSnapshot?: QueueLobbyGuardSnapshot | null;
};

type OverlayKindNullSourceSnapshot = {
  shellKind: string | null;
  activeKind: string | null;
  effectiveKind: string | null;
  queueHeadKind: string | null;
  ownerQueueLen: number | null;
  ownerPendingLen: number | null;
  overlayQueueLength: number | null;
  notificationOverlayVisible: boolean | null;
  visualQueueDimSessionLive: boolean | null;
  resultOverlayMounted: boolean | null;
  checkOverlayMounted: boolean | null;
  incomingOverlayMounted: boolean | null;
  directOverboardMounted: boolean | null;
  resolvedShellQueueHead: string | null;
};

type OverlayKindNullSourceEnrichmentProvider = () => Partial<OverlayKindNullSourceSnapshot>;

let enrichmentProvider: OverlayKindNullSourceEnrichmentProvider | null = null;
let previousKinds: Pick<
  OverlayKindNullSourceSnapshot,
  'shellKind' | 'activeKind' | 'effectiveKind' | 'queueHeadKind'
> = {
  shellKind: null,
  activeKind: null,
  effectiveKind: null,
  queueHeadKind: null,
};
let emittedSig = '';

export function registerOverlayKindNullSourceEnrichmentProvider(
  provider: OverlayKindNullSourceEnrichmentProvider | null,
): void {
  enrichmentProvider = provider;
}

function shortStack(): string | null {
  try {
    const stack = new Error('OVERLAY_KIND_NULL_SOURCE_TRACE').stack;
    if (!stack) return null;
    return stack
      .split('\n')
      .slice(1, 8)
      .map((line) => line.trim())
      .join(' | ');
  } catch {
    return null;
  }
}

/**
 * Observe kind fields. Emits OVERLAY_KIND_NULL_SOURCE_TRACE only on:
 * (prevShell|prevActive non-null) -> (shellKind null && activeKind null).
 */
export function observeOverlayKindNullSourceTransition(
  callSite: string,
  next: Partial<OverlayKindNullSourceSnapshot> & {
    shellKind?: string | null;
    activeKind?: string | null;
    effectiveKind?: string | null;
    selectorSource?: string | null;
    dispatchSource?: string | null;
  },
): void {
  if (!isClientDiagTraceEnvironment()) return;

  const enriched = enrichmentProvider?.() ?? {};
  const nextShellKind =
    next.shellKind !== undefined
      ? next.shellKind
      : previousKinds.shellKind;
  const nextActiveKind =
    next.activeKind !== undefined
      ? next.activeKind
      : previousKinds.activeKind;
  const nextEffectiveKind =
    next.effectiveKind !== undefined
      ? next.effectiveKind
      : previousKinds.effectiveKind;
  const nextQueueHeadKind =
    next.queueHeadKind !== undefined
      ? next.queueHeadKind
      : previousKinds.queueHeadKind;

  const previousShellKind = previousKinds.shellKind;
  const previousActiveKind = previousKinds.activeKind;
  const previousEffectiveKind = previousKinds.effectiveKind;

  const becameBothNull =
    (previousShellKind != null || previousActiveKind != null) &&
    nextShellKind == null &&
    nextActiveKind == null;

  if (becameBothNull) {
    const mutation = readQueueHeadMutationContext();
    const visualQueueDimSessionLive =
      next.visualQueueDimSessionLive ??
      enriched.visualQueueDimSessionLive ??
      getLastKnownVisualQueueDimSessionLive();

    const payload: OverlayKindNullSourceTrace = {
      timestamp: diagTraceNow(),
      previousShellKind,
      previousActiveKind,
      previousEffectiveKind,
      nextShellKind,
      nextActiveKind,
      nextEffectiveKind,
      ownerQueueLen:
        next.ownerQueueLen ?? enriched.ownerQueueLen ?? null,
      ownerPendingLen:
        next.ownerPendingLen ?? enriched.ownerPendingLen ?? null,
      overlayQueueLength:
        next.overlayQueueLength ?? enriched.overlayQueueLength ?? null,
      queueHeadKind: nextQueueHeadKind ?? enriched.queueHeadKind ?? null,
      resolvedShellQueueHead:
        next.resolvedShellQueueHead ??
        enriched.resolvedShellQueueHead ??
        null,
      notificationOverlayVisible:
        next.notificationOverlayVisible ??
        enriched.notificationOverlayVisible ??
        null,
      visualQueueDimSessionLive,
      resultOverlayMounted:
        next.resultOverlayMounted ?? enriched.resultOverlayMounted ?? null,
      checkOverlayMounted:
        next.checkOverlayMounted ?? enriched.checkOverlayMounted ?? null,
      incomingOverlayMounted:
        next.incomingOverlayMounted ??
        enriched.incomingOverlayMounted ??
        null,
      directOverboardMounted:
        next.directOverboardMounted ??
        enriched.directOverboardMounted ??
        null,
      mutationSource: mutation?.source ?? null,
      mutationReason: mutation?.reason ?? null,
      dispatchSource: next.dispatchSource ?? mutation?.operation ?? null,
      selectorSource: next.selectorSource ?? callSite,
      callSite,
      stack: shortStack(),
      guardSnapshot: getQueueLobbyGuardSnapshot(),
    };

    const sig = [
      payload.callSite,
      payload.previousShellKind,
      payload.previousActiveKind,
      payload.previousEffectiveKind,
      payload.nextShellKind,
      payload.nextActiveKind,
      payload.nextEffectiveKind,
      payload.ownerQueueLen,
      payload.ownerPendingLen,
      payload.overlayQueueLength,
      payload.queueHeadKind,
      payload.visualQueueDimSessionLive,
      payload.mutationSource,
      payload.mutationReason,
      payload.selectorSource,
    ].join('|');
    if (emittedSig !== sig) {
      emittedSig = sig;
      emitClientDiagTrace('OVERLAY_KIND_NULL_SOURCE_TRACE', payload);
    }
  }

  previousKinds = {
    shellKind: nextShellKind,
    activeKind: nextActiveKind,
    effectiveKind: nextEffectiveKind,
    queueHeadKind: nextQueueHeadKind ?? null,
  };
}
