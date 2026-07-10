'use client';

import { checkOverlayKey } from '@/lib/overlay-queue';
import { isClientDiagTraceEnvironment } from '@/lib/diag-trace-client';
import {
  readShellCheckActionMarkers,
  type ShellCheckActionMarkers,
} from '@/lib/shell-check-lifecycle-trace-debug';
import type { CheckOverlayParentReturnedBranch } from '@/lib/check-overlay-parent-return-branch-trace-debug';

export type CheckOverlayVisualShieldBlockRootCause =
  | 'should-mount-host-guards-false'
  | 'direct-overboard-layer-active'
  | 'card-content-mounted-false-with-operands-true'
  | 'unknown';

export type CheckOverlayVisualShieldBlockGuardOperands = {
  composeBlocksNotificationHost: boolean;
  checkAnswerWaitingResultHoldBanId: string | null;
  replyParentActivePriorityActive: boolean;
  ownerPrimaryHeldUserCardPresent: boolean;
  ownerPrimaryStableIncomingBanId: string | null;
  notificationChainTransitioning: boolean;
  notificationOverlayVisible: boolean;
  chainAdvanceWaiting: boolean;
  checkOverlayMounted: boolean;
  showDirectOverboardLayer: boolean;
  notificationQueueShellKind: string | null;
  ownerPrimaryCheckBanForDisplayGuardsId: string | null;
  ownerPrimaryDisplayResultForShellPresent: boolean;
  incomingCardDisplayBanPresent: boolean;
  incomingShellHydrating: boolean;
  incomingCardFullyReady: boolean;
  ownerPrimaryShellQueueLen: number;
  ownerPrimaryShellPendingLen: number;
};

export type CheckOverlayVisualShieldBlockRootInput = {
  previousReturnedBranch: CheckOverlayParentReturnedBranch | null;
  pathKey: 'queue-shell';
  reason: string;
  checkBanId: string | null;
  overlayVisualShieldCardContentMounted: boolean;
  shouldMountNotificationOverlayHostFromGuards: boolean;
  showDirectOverboardLayer: boolean;
  globalOverlayHostActive: boolean;
  composeBlocksNotificationHost: boolean;
  visualQueueDimSessionLive: boolean;
  overlayVisualShieldHostMounted: boolean;
  notificationOverlayVisible: boolean;
  activeNotificationChain: boolean;
  guardOperands: CheckOverlayVisualShieldBlockGuardOperands;
  shellKind: string | null;
  renderBranch: string | null;
  ownerDisplayKind: string | null;
  currentHeadKind: string | null;
  queueLen: number;
  ownerQueueLen: number;
};

const emittedKeys = new Set<string>();

function hasExpectedExitMarkersFalse(markers: ShellCheckActionMarkers): boolean {
  return (
    !markers.userPressedCheckYes &&
    !markers.userPressedCheckNo &&
    !markers.submitCheckAnswerStarted &&
    !markers.checkDismissStarted &&
    !markers.checkConsumed &&
    !markers.resultArrivedAfterCheck
  );
}

function resolveFirstFalseOperand(input: {
  shouldMountNotificationOverlayHostFromGuards: boolean;
  showDirectOverboardLayer: boolean;
}): string {
  if (!input.shouldMountNotificationOverlayHostFromGuards) {
    return 'shouldMountNotificationOverlayHostFromGuards';
  }
  if (input.showDirectOverboardLayer) {
    return 'showDirectOverboardLayer';
  }
  return 'unknown';
}

function resolveRootCause(input: {
  shouldMountNotificationOverlayHostFromGuards: boolean;
  showDirectOverboardLayer: boolean;
  overlayVisualShieldCardContentMounted: boolean;
}): CheckOverlayVisualShieldBlockRootCause {
  if (!input.shouldMountNotificationOverlayHostFromGuards) {
    return 'should-mount-host-guards-false';
  }
  if (input.showDirectOverboardLayer) {
    return 'direct-overboard-layer-active';
  }
  if (
    !input.overlayVisualShieldCardContentMounted &&
    input.shouldMountNotificationOverlayHostFromGuards &&
    !input.showDirectOverboardLayer
  ) {
    return 'card-content-mounted-false-with-operands-true';
  }
  return 'unknown';
}

export function maybeEmitCheckOverlayVisualShieldBlockRootTrace(
  _input: CheckOverlayVisualShieldBlockRootInput,
): void {
  // Disabled in favor of COMPOSE_BLOCKS_NOTIFICATION_HOST_FALSE_ROOT_TRACE.
}
