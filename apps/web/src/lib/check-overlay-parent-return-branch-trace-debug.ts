'use client';

import { checkOverlayKey } from '@/lib/overlay-queue';
import {
  diagTraceNow,
  emitClientDiagTrace,
  isClientDiagTraceEnvironment,
} from '@/lib/diag-trace-client';
import {
  readShellCheckActionMarkers,
  type ShellCheckActionMarkers,
} from '@/lib/shell-check-lifecycle-trace-debug';
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

export type CheckOverlayParentEarlyReturnType =
  | 'result-branch-won'
  | 'overlay-session-closed'
  | 'host-gate-failed'
  | 'visual-shield-gate-failed'
  | 'no-shell-branch'
  | 'null-return'
  | 'parent-unmounted'
  | 'other';

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

export type CheckOverlayParentReturnBranchSnapshot = {
  timestamp: number;
  pathKey: CheckOverlayParentReturnPathKey;
  currentReturnedBranch: CheckOverlayParentReturnedBranch;
  branchPriorityIndex: number;
  branchSourceFunction: string;
  branchSourceLine: string;
  context: CheckOverlayParentReturnBranchContext;
};

type BranchEvaluation = {
  branch: string;
  conditionResult: boolean;
  reachIndex: number;
};

export type CheckOverlayParentBranchPriorityCollector = {
  scope: string;
  markBranchReached: (branch: string) => number;
  markBranchEvaluated: (branch: string, conditionResult: boolean) => void;
  markBranchSelected: (branch: string) => void;
  getBranchReachIndex: (branch: string) => number;
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
const previousSnapshotByPathKey = new Map<
  CheckOverlayParentReturnPathKey,
  CheckOverlayParentReturnBranchSnapshot
>();
const earlyReturnEmittedKeys = new Set<string>();
const branchPrioritySigByScope = new Map<string, string>();

let lastReturnBranchChangeAnchor: {
  timestamp: number;
  pathKey: CheckOverlayParentReturnPathKey;
  previousReturnedBranch: CheckOverlayParentReturnedBranch | null;
  currentReturnedBranch: CheckOverlayParentReturnedBranch;
  checkBanId: string | null;
  branchSourceFunction: string;
  branchSourceLine: string;
} | null = null;

function captureStack(label: string): string {
  try {
    return new Error(label).stack ?? '';
  } catch {
    return '';
  }
}

function hasExpectedExitMarkers(markers: ShellCheckActionMarkers): boolean {
  return (
    markers.userPressedCheckYes ||
    markers.userPressedCheckNo ||
    markers.submitCheckAnswerStarted ||
    markers.checkDismissStarted ||
    markers.checkConsumed ||
    markers.resultArrivedAfterCheck
  );
}

function isCheckOverlayBranch(
  branch: CheckOverlayParentReturnedBranch,
): boolean {
  return branch === 'check-overlay' || branch === 'check-overlay-direct';
}

function resolveEarlyReturnType(
  branch: CheckOverlayParentReturnedBranch,
): CheckOverlayParentEarlyReturnType {
  switch (branch) {
    case 'result-overlay':
      return 'result-branch-won';
    case 'overlay-session-closed':
      return 'overlay-session-closed';
    case 'global-host-not-emitting':
      return 'host-gate-failed';
    case 'visual-shield-blocked':
      return 'visual-shield-gate-failed';
    case 'no-shell':
    case 'shell-check-without-payload':
      return 'no-shell-branch';
    case 'null-return':
      return 'null-return';
    default:
      return 'other';
  }
}

function resolveWinningGates(
  branch: CheckOverlayParentReturnedBranch,
): string[] {
  switch (branch) {
    case 'overlay-session-closed':
      return ['overlay-session-closed'];
    case 'global-host-not-emitting':
      return ['global-host-not-emitting'];
    case 'visual-shield-blocked':
      return ['visual-shield-blocked'];
    case 'result-overlay':
      return ['result-overlay-branch-won'];
    case 'null-return':
      return ['null-return'];
    case 'no-shell':
    case 'shell-check-without-payload':
      return ['no-shell-branch'];
    default:
      return [branch];
  }
}

function resolveConditionResult(
  evaluations: BranchEvaluation[],
  branch: string,
): boolean | null {
  const item = evaluations.find((entry) => entry.branch === branch);
  return item ? item.conditionResult : null;
}

export function readCheckOverlayParentReturnBranchTimelineAnchor(): typeof lastReturnBranchChangeAnchor {
  return lastReturnBranchChangeAnchor;
}

export function buildCheckOverlayParentReturnBranchTimelineFields():
  | {
      parentReturnBranchTimestamp: number;
      parentReturnBranchPathKey: CheckOverlayParentReturnPathKey;
      parentReturnBranchPrevious: CheckOverlayParentReturnedBranch | null;
      parentReturnBranchCurrent: CheckOverlayParentReturnedBranch;
      parentReturnBranchSourceFunction: string;
      parentReturnBranchSourceLine: string;
    }
  | null {
  if (!lastReturnBranchChangeAnchor) return null;
  return {
    parentReturnBranchTimestamp: lastReturnBranchChangeAnchor.timestamp,
    parentReturnBranchPathKey: lastReturnBranchChangeAnchor.pathKey,
    parentReturnBranchPrevious: lastReturnBranchChangeAnchor.previousReturnedBranch,
    parentReturnBranchCurrent: lastReturnBranchChangeAnchor.currentReturnedBranch,
    parentReturnBranchSourceFunction:
      lastReturnBranchChangeAnchor.branchSourceFunction,
    parentReturnBranchSourceLine: lastReturnBranchChangeAnchor.branchSourceLine,
  };
}

export function createCheckOverlayParentBranchPriorityCollector(
  scope: string,
): CheckOverlayParentBranchPriorityCollector {
  const reachedBranches: string[] = [];
  const reachIndexByBranch = new Map<string, number>();
  const evaluations: BranchEvaluation[] = [];
  let selectedBranch: string | null = null;

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
    commit(input) {
      if (!isClientDiagTraceEnvironment()) return;
      if (!selectedBranch) return;

      const evaluatedBranches = evaluations.map((entry) => entry.branch);
      const checkBranchWasReachable = reachedBranches.includes('check-overlay');
      const checkBranchWasEvaluated = evaluatedBranches.includes('check-overlay');
      const checkBranchConditionResult = checkBranchWasEvaluated
        ? resolveConditionResult(evaluations, 'check-overlay')
        : null;
      const incomingBranchWasReachable =
        reachedBranches.includes('incoming-overlay') ||
        reachedBranches.includes('incoming-reply-direct');
      const incomingBranchWasEvaluated =
        evaluatedBranches.includes('incoming-overlay') ||
        evaluatedBranches.includes('incoming-reply-direct');
      const resultBranchWasEvaluated =
        evaluatedBranches.includes('result-overlay');

      const selectedReachIndex =
        reachIndexByBranch.get(selectedBranch) ??
        (reachedBranches.length > 0 ? reachedBranches.length - 1 : 0);

      const skippedBranches = evaluations
        .filter((entry) => {
          if (entry.branch === selectedBranch) return false;
          if (entry.reachIndex >= selectedReachIndex) return false;
          return !entry.conditionResult;
        })
        .map((entry) => entry.branch);

      const sig = [
        selectedBranch,
        ...reachedBranches,
        ...evaluations.map(
          (entry) => `${entry.branch}:${entry.conditionResult ? 1 : 0}`,
        ),
        checkBranchWasReachable,
        checkBranchWasEvaluated,
        checkBranchConditionResult,
        incomingBranchWasReachable,
        incomingBranchWasEvaluated,
        resultBranchWasEvaluated,
      ].join('|');
      if (branchPrioritySigByScope.get(scope) === sig) return;
      branchPrioritySigByScope.set(scope, sig);

      emitClientDiagTrace('CHECK_OVERLAY_BRANCH_PRIORITY_TRACE', {
        timestamp: diagTraceNow(),
        source: input.source,
        calledFrom: input.calledFrom,
        stack: captureStack('CHECK_OVERLAY_BRANCH_PRIORITY_TRACE'),
        scope,
        reachedBranches: [...reachedBranches],
        evaluatedBranches,
        branchConditions: evaluations.map((entry) => ({
          branch: entry.branch,
          conditionResult: entry.conditionResult,
          reachIndex: entry.reachIndex,
        })),
        selectedBranch,
        firstMatchedBranch: selectedBranch,
        skippedBranches,
        checkBranchWasReachable,
        checkBranchWasEvaluated,
        checkBranchConditionResult,
        incomingBranchWasReachable,
        incomingBranchWasEvaluated,
        resultBranchWasEvaluated,
        shellKind: input.context.shellKind,
        renderBranch: input.context.renderBranch,
        checkBanId: input.context.checkBanId,
        actualCheckOverlayElementCreated:
          input.context.actualCheckOverlayElementCreated,
      });
    },
  };
}

function maybeEmitEarlyReturn(
  previous: CheckOverlayParentReturnBranchSnapshot | undefined,
  current: CheckOverlayParentReturnBranchSnapshot,
): void {
  if (!previous) return;
  if (!isCheckOverlayBranch(previous.currentReturnedBranch)) return;
  if (isCheckOverlayBranch(current.currentReturnedBranch)) return;

  const markers = readShellCheckActionMarkers();
  const unexpected = !hasExpectedExitMarkers(markers);
  const key = [
    current.pathKey,
    previous.currentReturnedBranch,
    current.currentReturnedBranch,
    previous.context.checkBanId ?? 'no-ban',
    current.timestamp,
  ].join('|');
  if (earlyReturnEmittedKeys.has(key)) return;
  earlyReturnEmittedKeys.add(key);

  const earlyReturnType = resolveEarlyReturnType(current.currentReturnedBranch);
  const allWinningGates = resolveWinningGates(current.currentReturnedBranch);

  emitClientDiagTrace('CHECK_OVERLAY_PARENT_EARLY_RETURN_TRACE', {
    timestamp: current.timestamp,
    pathKey: current.pathKey,
    previousBranchSnapshot: previous,
    currentBranchSnapshot: current,
    earlyReturnType,
    firstWinningGate: allWinningGates[0] ?? earlyReturnType,
    allWinningGates,
    unexpected,
    expectedExitMarkers: markers,
    ...buildCheckOverlayParentReturnBranchTimelineFields(),
  });
}

export function observeCheckOverlayParentReturnBranch(input: {
  pathKey: CheckOverlayParentReturnPathKey;
  source: string;
  reason: string;
  calledFrom: string;
  currentReturnedBranch: CheckOverlayParentReturnedBranch;
  branchPriorityIndex: number;
  branchSourceFunction: string;
  branchSourceLine: string;
  context: CheckOverlayParentReturnBranchContext;
}): void {
  if (!isClientDiagTraceEnvironment()) return;

  const previousBranch = previousBranchByPathKey.get(input.pathKey) ?? null;
  if (previousBranch === input.currentReturnedBranch) return;

  const timestamp = diagTraceNow();
  const snapshot: CheckOverlayParentReturnBranchSnapshot = {
    timestamp,
    pathKey: input.pathKey,
    currentReturnedBranch: input.currentReturnedBranch,
    branchPriorityIndex: input.branchPriorityIndex,
    branchSourceFunction: input.branchSourceFunction,
    branchSourceLine: input.branchSourceLine,
    context: input.context,
  };
  const previousSnapshot = previousSnapshotByPathKey.get(input.pathKey);

  emitClientDiagTrace('CHECK_OVERLAY_PARENT_RETURN_BRANCH_TRACE', {
    timestamp,
    source: input.source,
    reason: input.reason,
    calledFrom: input.calledFrom,
    stack: captureStack('CHECK_OVERLAY_PARENT_RETURN_BRANCH_TRACE'),
    pathKey: input.pathKey,
    previousReturnedBranch: previousBranch,
    currentReturnedBranch: input.currentReturnedBranch,
    branchPriorityIndex: input.branchPriorityIndex,
    branchSourceFunction: input.branchSourceFunction,
    branchSourceLine: input.branchSourceLine,
    shellKind: input.context.shellKind,
    renderBranch: input.context.renderBranch,
    returnBranch: input.context.returnBranch,
    activeKind: input.context.activeKind,
    ownerDisplayKind: input.context.ownerDisplayKind,
    currentHeadKind: input.context.currentHeadKind,
    notificationOverlayVisible: input.context.notificationOverlayVisible,
    queueClaimsNotificationScreen: input.context.queueClaimsNotificationScreen,
    activeNotificationChain: input.context.activeNotificationChain,
    visualQueueDimSessionLive: input.context.visualQueueDimSessionLive,
    checkBanId: input.context.checkBanId,
    checkOverlayKey: input.context.checkOverlayKey,
    resultBanId: input.context.resultBanId,
    resultOverlayKey: input.context.resultOverlayKey,
    incomingBanId: input.context.incomingBanId,
    incomingOverlayKey: input.context.incomingOverlayKey,
    actualCheckOverlayElementCreated: input.context.actualCheckOverlayElementCreated,
    ownerQueueLen: input.context.queues.ownerQueueLen,
    ownerQueueKinds: input.context.queues.ownerQueueKinds,
    ownerQueueIds: input.context.queues.ownerQueueIds,
    ownerQueueKeys: input.context.queues.ownerQueueKeys,
    ownerPendingLen: input.context.queues.ownerPendingLen,
    ownerPendingKinds: input.context.queues.ownerPendingKinds,
    ownerPendingIds: input.context.queues.ownerPendingIds,
    ownerPendingKeys: input.context.queues.ownerPendingKeys,
    overlayQueueRefLen: input.context.queues.overlayQueueRefLen,
    overlayQueueRefKinds: input.context.queues.overlayQueueRefKinds,
    overlayQueueRefIds: input.context.queues.overlayQueueRefIds,
    overlayQueueRefKeys: input.context.queues.overlayQueueRefKeys,
    overlayQueueStateLen: input.context.queues.overlayQueueStateLen,
    overlayQueueStateKinds: input.context.queues.overlayQueueStateKinds,
    overlayQueueStateIds: input.context.queues.overlayQueueStateIds,
    overlayQueueStateKeys: input.context.queues.overlayQueueStateKeys,
  });

  maybeEmitEarlyReturn(previousSnapshot, snapshot);

  lastReturnBranchChangeAnchor = {
    timestamp,
    pathKey: input.pathKey,
    previousReturnedBranch: previousBranch,
    currentReturnedBranch: input.currentReturnedBranch,
    checkBanId: input.context.checkBanId,
    branchSourceFunction: input.branchSourceFunction,
    branchSourceLine: input.branchSourceLine,
  };

  previousBranchByPathKey.set(input.pathKey, input.currentReturnedBranch);
  previousSnapshotByPathKey.set(input.pathKey, snapshot);
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
