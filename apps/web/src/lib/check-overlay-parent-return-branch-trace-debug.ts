'use client';

import { checkOverlayKey } from '@/lib/overlay-queue';
import { isClientDiagTraceEnvironment } from '@/lib/diag-trace-client';
import type { CheckOverlayShouldRenderQueueFields } from '@/lib/check-overlay-should-render-trace-debug';

export type CheckOverlayParentReturnedBranch =
  | 'result-overlay'
  | 'check-overlay'
  | 'check-overlay-direct'
  | 'incoming-overlay'
  | 'incoming-reply-direct'
  | 'shell-check-without-payload'
  | 'overlay-session-closed'
  | 'visual-shield-blocked'
  | 'global-host-not-emitting'
  | 'no-shell'
  | 'null-return'
  | 'other';

export type CheckOverlayParentReturnPathKey =
  | 'queue-shell'
  | 'direct-check'
  | 'overlay-root'
  | 'incoming-reply-direct';

export type CheckOverlayParentReturnBranchContext = {
  shellKind: string | null;
  renderBranch: string | null;
  returnBranch: string | null;
  activeKind: string | null;
  ownerDisplayKind: string | null;
  currentHeadKind: string | null;
  notificationOverlayVisible: boolean | null;
  queueClaimsNotificationScreen: boolean | null;
  activeNotificationChain: boolean | null;
  visualQueueDimSessionLive: boolean | null;
  checkBanId: string | null;
  checkOverlayKey: string | null;
  resultBanId: string | null;
  resultOverlayKey: string | null;
  incomingBanId: string | null;
  incomingOverlayKey: string | null;
  actualCheckOverlayElementCreated: boolean;
  queues: CheckOverlayShouldRenderQueueFields;
};

type BranchEvaluation = {
  branch: string;
  conditionResult: boolean;
  reachIndex: number;
};

export type CheckOverlayParentBranchPrioritySnapshot = {
  reachedBranches: string[];
  evaluatedBranches: string[];
  selectedBranch: string | null;
  firstMatchedBranch: string | null;
};

export type CheckOverlayParentBranchPriorityCollector = {
  scope: string;
  markBranchReached: (branch: string) => number;
  markBranchEvaluated: (branch: string, conditionResult: boolean) => void;
  markBranchSelected: (branch: string) => void;
  getBranchReachIndex: (branch: string) => number;
  getSnapshot: () => CheckOverlayParentBranchPrioritySnapshot;
  commit: (input: {
    context: CheckOverlayParentReturnBranchContext;
    source: string;
    calledFrom: string;
  }) => void;
};

const previousBranchByPathKey = new Map<
  CheckOverlayParentReturnPathKey,
  CheckOverlayParentReturnedBranch | null
>();

export function readCheckOverlayParentReturnedBranch(
  pathKey: CheckOverlayParentReturnPathKey,
): CheckOverlayParentReturnedBranch | null {
  return previousBranchByPathKey.get(pathKey) ?? null;
}

function maybeEmitRealRootCause(_input: {
  pathKey: CheckOverlayParentReturnPathKey;
  previousReturnedBranch: CheckOverlayParentReturnedBranch | null;
  currentReturnedBranch: CheckOverlayParentReturnedBranch;
  reason: string;
  context: CheckOverlayParentReturnBranchContext;
  prioritySnapshot: CheckOverlayParentBranchPrioritySnapshot | null;
}): void {
  // Disabled in favor of OVERLAY_VISUAL_SHIELD_CONTENT_UNMOUNT_ROOT_TRACE.
}

export function createCheckOverlayParentBranchPriorityCollector(
  scope: string,
): CheckOverlayParentBranchPriorityCollector {
  const reachedBranches: string[] = [];
  const reachIndexByBranch = new Map<string, number>();
  const evaluations: BranchEvaluation[] = [];
  let selectedBranch: string | null = null;

  const getSnapshot = (): CheckOverlayParentBranchPrioritySnapshot => ({
    reachedBranches: [...reachedBranches],
    evaluatedBranches: evaluations.map((entry) => entry.branch),
    selectedBranch,
    firstMatchedBranch: selectedBranch,
  });

  return {
    scope,
    markBranchReached(branch: string) {
      const reachIndex = reachedBranches.length;
      reachedBranches.push(branch);
      reachIndexByBranch.set(branch, reachIndex);
      return reachIndex;
    },
    markBranchEvaluated(branch: string, conditionResult: boolean) {
      const reachIndex = reachIndexByBranch.get(branch);
      if (reachIndex === undefined) return;
      evaluations.push({ branch, conditionResult, reachIndex });
    },
    markBranchSelected(branch: string) {
      selectedBranch = branch;
    },
    getBranchReachIndex(branch: string) {
      return reachIndexByBranch.get(branch) ?? -1;
    },
    getSnapshot,
    commit(_input) {
      // Priority state is read via getSnapshot() at branch transition time.
    },
  };
}

export function observeCheckOverlayParentReturnBranch(input: {
  pathKey: CheckOverlayParentReturnPathKey;
  reason: string;
  currentReturnedBranch: CheckOverlayParentReturnedBranch;
  context: CheckOverlayParentReturnBranchContext;
  priorityCollector?: CheckOverlayParentBranchPriorityCollector | null;
}): void {
  if (!isClientDiagTraceEnvironment()) return;

  const previousReturnedBranch =
    previousBranchByPathKey.get(input.pathKey) ?? null;
  if (previousReturnedBranch === input.currentReturnedBranch) return;

  maybeEmitRealRootCause({
    pathKey: input.pathKey,
    previousReturnedBranch,
    currentReturnedBranch: input.currentReturnedBranch,
    reason: input.reason,
    context: input.context,
    prioritySnapshot: input.priorityCollector?.getSnapshot() ?? null,
  });

  previousBranchByPathKey.set(input.pathKey, input.currentReturnedBranch);
}

export function buildCheckOverlayParentReturnBranchContext(input: {
  shellKind: string | null;
  renderBranch: string | null;
  returnBranch: string | null;
  activeKind: string | null;
  ownerDisplayKind: string | null;
  currentHeadKind: string | null;
  notificationOverlayVisible: boolean | null;
  queueClaimsNotificationScreen: boolean | null;
  activeNotificationChain: boolean | null;
  visualQueueDimSessionLive: boolean | null;
  checkBanId: string | null;
  resultBanId: string | null;
  incomingBanId: string | null;
  actualCheckOverlayElementCreated: boolean;
  queues: CheckOverlayShouldRenderQueueFields;
}): CheckOverlayParentReturnBranchContext {
  const checkBanId = input.checkBanId?.trim() || null;
  const resultBanId = input.resultBanId?.trim() || null;
  const incomingBanId = input.incomingBanId?.trim() || null;
  return {
    shellKind: input.shellKind,
    renderBranch: input.renderBranch,
    returnBranch: input.returnBranch,
    activeKind: input.activeKind,
    ownerDisplayKind: input.ownerDisplayKind,
    currentHeadKind: input.currentHeadKind,
    notificationOverlayVisible: input.notificationOverlayVisible,
    queueClaimsNotificationScreen: input.queueClaimsNotificationScreen,
    activeNotificationChain: input.activeNotificationChain,
    visualQueueDimSessionLive: input.visualQueueDimSessionLive,
    checkBanId,
    checkOverlayKey: checkBanId ? checkOverlayKey(checkBanId) : null,
    resultBanId,
    resultOverlayKey: resultBanId ? `result:${resultBanId}` : null,
    incomingBanId,
    incomingOverlayKey: incomingBanId ? `incoming:${incomingBanId}` : null,
    actualCheckOverlayElementCreated: input.actualCheckOverlayElementCreated,
    queues: input.queues,
  };
}

// Timeline bridge retained as no-op exports for existing imports.
export function readCheckOverlayParentReturnBranchTimelineAnchor(): null {
  return null;
}

export function buildCheckOverlayParentReturnBranchTimelineFields(): null {
  return null;
}
