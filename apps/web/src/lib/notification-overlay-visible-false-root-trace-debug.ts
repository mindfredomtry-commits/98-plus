'use client';

import type { CheckOverlayParentReturnedBranch } from '@/lib/check-overlay-parent-return-branch-trace-debug';

export type NotificationOverlayVisibilityOperand = {
  name: string;
  value: string | boolean | number | null;
};

export type NotificationOverlayVisibilityEvaluation = {
  name: string;
  conditionResult: boolean;
};

export type NotificationOverlayVisibilitySnapshot = {
  reachedVisibilityGuards: string[];
  evaluatedVisibilityGuards: NotificationOverlayVisibilityEvaluation[];
  selectedVisibilityFalseGuard: string | null;
  visibilitySourceType: 'derived';
  guardSourceFunction: string;
  guardSourceLine: string;
  visibilityOperands: NotificationOverlayVisibilityOperand[];
  derivedResult: boolean;
};

export type NotificationOverlayVisibleFinalGuardEmitContext = {
  checkBanId: string | null;
  shellKind: string | null;
  renderBranch: string | null;
  ownerDisplayKind: string | null;
  currentHeadKind: string | null;
  activeNotificationChain: boolean;
  notificationChainTransitioning: boolean;
  chainAdvanceWaiting: boolean;
  checkOverlayMounted: boolean;
  showCheckOverlayDirect: boolean;
  showDirectOverboardLayer: boolean;
  sendSuccessCardActive: boolean;
  replyParentActivePriorityActive: boolean;
  activeBanCardReady: boolean;
  notificationQueueShellKind: string | null;
  ownerPrimaryHeldUserCardExists: boolean;
  ownerPrimaryCheckBanForDisplayGuardsExists: boolean;
  hasRenderableCard: boolean | null;
  shouldHoldNotificationOverlayVisibleDuringQueueGap: boolean | null;
  previousQueueShellReturnedBranch: CheckOverlayParentReturnedBranch | null;
};

export type NotificationOverlayVisibilityCollector = {
  markVisibilityGuardReached: (name: string) => void;
  markVisibilityGuardEvaluated: (name: string, conditionResult: boolean) => void;
  markVisibilityGuardSelected: (
    name: string,
    operands: NotificationOverlayVisibilityOperand[],
    sourceLine: string,
  ) => void;
  getSnapshot: (derivedResult: boolean) => NotificationOverlayVisibilitySnapshot;
};

let lastNotificationOverlayVisibilitySnapshot: NotificationOverlayVisibilitySnapshot | null =
  null;
let previousNotificationOverlayVisible: boolean | null = null;
let lastStagedNotificationOverlayVisible: boolean | null = null;
let lastVisibilitySnapshotTimestamp: number | null = null;

export function createNotificationOverlayVisibilityCollector(): NotificationOverlayVisibilityCollector {
  const reachedVisibilityGuards: string[] = [];
  const evaluatedVisibilityGuards: NotificationOverlayVisibilityEvaluation[] = [];
  let selectedVisibilityFalseGuard: string | null = null;
  let guardSourceLine = 'unknown';
  let visibilityOperands: NotificationOverlayVisibilityOperand[] = [];

  return {
    markVisibilityGuardReached(name: string) {
      reachedVisibilityGuards.push(name);
    },
    markVisibilityGuardEvaluated(name: string, conditionResult: boolean) {
      evaluatedVisibilityGuards.push({ name, conditionResult });
    },
    markVisibilityGuardSelected(
      name: string,
      operands: NotificationOverlayVisibilityOperand[],
      sourceLine: string,
    ) {
      selectedVisibilityFalseGuard = name;
      guardSourceLine = sourceLine;
      visibilityOperands = operands;
    },
    getSnapshot(derivedResult: boolean): NotificationOverlayVisibilitySnapshot {
      return {
        reachedVisibilityGuards: [...reachedVisibilityGuards],
        evaluatedVisibilityGuards: [...evaluatedVisibilityGuards],
        selectedVisibilityFalseGuard,
        visibilitySourceType: 'derived',
        guardSourceFunction: 'ProvidersBody:notificationOverlayVisible',
        guardSourceLine,
        visibilityOperands: [...visibilityOperands],
        derivedResult,
      };
    },
  };
}

export function stageNotificationOverlayVisibilitySnapshot(
  snapshot: NotificationOverlayVisibilitySnapshot,
): void {
  previousNotificationOverlayVisible = lastStagedNotificationOverlayVisible;
  lastStagedNotificationOverlayVisible = snapshot.derivedResult;
  lastNotificationOverlayVisibilitySnapshot = snapshot;
  lastVisibilitySnapshotTimestamp = performance.now();
}

export function readVisibilitySnapshotTimestamp(): number | null {
  return lastVisibilitySnapshotTimestamp;
}

export function readNotificationOverlayVisibilitySnapshot(): NotificationOverlayVisibilitySnapshot | null {
  return lastNotificationOverlayVisibilitySnapshot;
}

export function readPreviousNotificationOverlayVisible(): boolean | null {
  return previousNotificationOverlayVisible;
}

export function maybeEmitNotificationOverlayVisibleFinalGuardTrace(
  _collector: NotificationOverlayVisibilityCollector,
  _input: NotificationOverlayVisibleFinalGuardEmitContext,
): void {
  // Console emit disabled. This was a render-phase (useMemo) console.error and
  // is superseded by the single non-render event-path trace
  // FINALIZE_QUEUE_OVERBOARD_SELECTOR_TRACE (emitted from
  // finalizeResultForGoToBans, inside the queueOverboard branch after
  // nextQueueWithoutCurrent is computed and before any live-queue mutation). No
  // render-phase logging remains here.
}

export function maybeEmitNotificationOverlayVisibilityBranchRootTrace(
  _input: unknown,
): void {
  // Disabled in favor of NOTIFICATION_OVERLAY_VISIBLE_FINAL_GUARD_TRACE.
}
