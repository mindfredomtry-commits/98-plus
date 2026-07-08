'use client';

import { isActiveNotificationQueueHeadKind } from '@/lib/overlay-backdrop-visibility-decision-debug';

export type DirectOverboardGapTrace = {
  timestamp: number;
  directOverboardMounted: boolean;
  directOverboardActive: boolean;
  portalTarget: string | null;
  bodyChildCount: number | null;
  resultId: string | null;
  banId: string | null;
  outcome: string | null;
  visualQueueDimSessionLive: boolean;
  bridgeBackdropActive: boolean;
  globalOverlayHostActive: boolean;
  backdropMounted: boolean;
  backdropActive: boolean;
  backdropComputedOpacity: string | null;
  queueLen: number;
  queueHeadKind: string | null;
  nextQueueHeadKind: string | null;
  notificationOverlayVisible: boolean;
  activeKind: string | null;
  shellKind: string | null;
  reason: string;
};

export type DirectOverboardGapSnapshot = Omit<
  DirectOverboardGapTrace,
  'timestamp' | 'reason'
>;

type DirectOverboardGapSnapshotProvider = () => DirectOverboardGapSnapshot;

let snapshotProvider: DirectOverboardGapSnapshotProvider | null = null;

export function registerDirectOverboardGapSnapshotProvider(
  provider: DirectOverboardGapSnapshotProvider | null,
): void {
  snapshotProvider = provider;
}

const EMPTY_SNAPSHOT: DirectOverboardGapSnapshot = {
  directOverboardMounted: false,
  directOverboardActive: false,
  portalTarget: null,
  bodyChildCount: null,
  resultId: null,
  banId: null,
  outcome: null,
  visualQueueDimSessionLive: false,
  bridgeBackdropActive: false,
  globalOverlayHostActive: false,
  backdropMounted: false,
  backdropActive: false,
  backdropComputedOpacity: null,
  queueLen: 0,
  queueHeadKind: null,
  nextQueueHeadKind: null,
  notificationOverlayVisible: false,
  activeKind: null,
  shellKind: null,
};

export function readDirectOverboardGapBackdropDom(): Pick<
  DirectOverboardGapSnapshot,
  | 'backdropMounted'
  | 'backdropActive'
  | 'backdropComputedOpacity'
  | 'globalOverlayHostActive'
> {
  if (typeof document === 'undefined') {
    return {
      backdropMounted: false,
      backdropActive: false,
      backdropComputedOpacity: null,
      globalOverlayHostActive: false,
    };
  }
  const host = document.querySelector('[data-global-overlay-host]');
  const backdrop = document.querySelector('[data-overlay-backdrop]');
  const hostStyle = host ? getComputedStyle(host) : null;
  const backdropStyle = backdrop ? getComputedStyle(backdrop) : null;
  const backdropActive =
    backdrop != null &&
    backdropStyle != null &&
    backdropStyle.visibility !== 'hidden' &&
    backdropStyle.display !== 'none' &&
    Number.parseFloat(backdropStyle.opacity || '0') > 0;
  return {
    globalOverlayHostActive: host != null,
    backdropMounted: backdrop != null,
    backdropActive,
    backdropComputedOpacity: backdropStyle?.opacity ?? null,
  };
}

export function shouldArmDirectOverboardCleanupBridge(input: {
  ownerQueueLen: number;
  ownerPendingLen: number;
  prevOwnerQueueLen?: number;
  prevOwnerPendingLen?: number;
  queueHeadKind: string | null;
  notificationChainTransitioning: boolean;
  notificationSessionActive: boolean;
  chainAdvanceWaiting: boolean;
  chainHandoffActive: boolean;
}): boolean {
  const nextQueueHeadExists =
    input.ownerQueueLen > 0 ||
    input.ownerPendingLen > 0 ||
    isActiveNotificationQueueHeadKind(input.queueHeadKind);
  const prevHadQueue =
    (input.prevOwnerQueueLen ?? 0) > 0 || (input.prevOwnerPendingLen ?? 0) > 0;
  const transitionActive =
    input.notificationChainTransitioning ||
    input.notificationSessionActive ||
    input.chainAdvanceWaiting ||
    input.chainHandoffActive;

  // Queue can clear in the same frame as DirectOverboard unmount (1→0). Arm when
  // the previous frame still had queue/pending, or any transition flag is live.
  return nextQueueHeadExists || prevHadQueue || transitionActive;
}

export function shouldHoldDirectOverboardCleanupBridgeBackdrop(input: {
  bridgeBackdropActive: boolean;
  sendFlowOpening: boolean;
  replyParentTimerOwnsTopLayer: boolean;
}): boolean {
  // Once armed, hold backdrop until explicit release (stable next card or empty
  // queue with no transition) — do not re-require queueLen/transition each frame.
  return (
    input.bridgeBackdropActive &&
    !input.sendFlowOpening &&
    !input.replyParentTimerOwnsTopLayer
  );
}

export function shouldReleaseDirectOverboardCleanupBridge(input: {
  bridgeBackdropActive: boolean;
  visualQueueCardShowing: boolean;
}): boolean {
  if (!input.bridgeBackdropActive) return false;
  // Hand off to the next stable card's normal visual-session ownership.
  // Empty-queue release is deferred to visual-session grace / commit release so
  // a transient 1→0 consume gap does not peel the dim off mid-bridge.
  return input.visualQueueCardShowing;
}

export function logDirectOverboardGapTrace(
  reason: string,
  extra?: Partial<DirectOverboardGapTrace>,
): void {
  const base = snapshotProvider?.() ?? EMPTY_SNAPSHOT;
  const dom = readDirectOverboardGapBackdropDom();
  const payload: DirectOverboardGapTrace = {
    timestamp: performance.now(),
    ...base,
    ...dom,
    ...extra,
    reason,
  };
  console.log('DIRECT_OVERBOARD_GAP_TRACE', payload);
  window.__debug98log?.('DIRECT_OVERBOARD_GAP_TRACE', payload);
}
