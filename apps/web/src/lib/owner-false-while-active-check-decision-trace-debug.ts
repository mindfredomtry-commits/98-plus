'use client';

import {
  checkOverlayKey,
  overlayQueueKey,
  type QueuedOverlay,
} from '@/lib/overlay-queue';
import { queueHeadIdFrom } from '@/lib/queue-head-lifecycle-trace-debug';
import { resolveOwnerDisplayKindBanId } from '@/lib/display-commit-trace-debug';
import {
  diagTraceNow,
  emitClientDiagTrace,
  isClientDiagTraceEnvironment,
} from '@/lib/diag-trace-client';

export type OwnerFalseWhileActiveCheckSnapshot = {
  ownerHasPendingNotificationChain: boolean;
  legacyHasPendingNotificationChain: boolean;
  checkBanId: string | null;
  checkOverlayKey: string | null;
  shellKind: string | null;
  renderBranch: string | null;
  returnBranch: string | null;
  activeKind: string | null;
  activeBanId: string | null;
  ownerDisplayKind: string | null;
  ownerDisplayBanId: string | null;
  currentHeadKind: string | null;
  currentHeadId: string | null;
  checkPresentInQueues: boolean;
  ownerQueueLen: number;
  ownerQueueKinds: string[];
  ownerQueueIds: string[];
  ownerQueueKeys: string[];
  ownerPendingLen: number;
  ownerPendingKinds: string[];
  ownerPendingIds: string[];
  ownerPendingKeys: string[];
  overlayQueueRefLen: number;
  overlayQueueRefKinds: string[];
  overlayQueueRefIds: string[];
  overlayQueueRefKeys: string[];
  overlayQueueStateLen: number;
  overlayQueueStateKinds: string[];
  overlayQueueStateIds: string[];
  overlayQueueStateKeys: string[];
  activeNotificationChain: boolean | null;
  notificationOverlayVisible: boolean | null;
  queueClaimsNotificationScreen: boolean | null;
  visualQueueDimSessionLive: boolean | null;
  explicitDrainReason: string | null;
  drainSessionId: string | number | null;
  notificationChainTransitioning: boolean | null;
  sendFlowOpening: boolean | null;
  lobbyVisible: boolean | null;
  lobbyMounted: boolean | null;
};

export type OwnerFalseWhileActiveCheckDecisionInputs = {
  ownerHasPendingNotificationChain: boolean;
  legacyHasPendingNotificationChain: boolean;
  ownerQueueLen: number;
  ownerPendingLen: number;
  overlayQueueRefLen: number;
  overlayQueueStateLen: number;
  ownerQueueKinds: string[];
  ownerPendingKinds: string[];
  overlayQueueRefKinds: string[];
  overlayQueueStateKinds: string[];
  shellKind: string | null;
  renderBranch: string | null;
  returnBranch: string | null;
  activeKind: string | null;
  ownerDisplayKind: string | null;
  currentHeadKind: string | null;
  activeNotificationChain: boolean | null;
  notificationOverlayVisible: boolean | null;
  queueClaimsNotificationScreen: boolean | null;
  visualQueueDimSessionLive: boolean | null;
  notificationChainTransitioning: boolean | null;
  explicitDrainReason: string | null;
  drainSessionId: string | number | null;
  checkPresentInOwnerQueue: boolean;
  checkPresentInOwnerPending: boolean;
  checkPresentInOverlayQueueRef: boolean;
  checkPresentInOverlayQueueState: boolean;
  sendFlowOpening: boolean | null;
  lobbyVisible: boolean | null;
  lobbyMounted: boolean | null;
} & Record<string, unknown>;

export type OwnerFalseWhileActiveCheckTraceSnapshot =
  OwnerFalseWhileActiveCheckSnapshot & {
    decisionInputs: OwnerFalseWhileActiveCheckDecisionInputs;
  };

export type OwnerFalseWhileActiveCheckDecisionInput = {
  decisionName: string;
  selector: string;
  source: string;
  reason: string;
  calledFrom: string;
  ownerHasPendingNotificationChain?: boolean;
  legacyHasPendingNotificationChain?: boolean;
  decisionResult?: boolean | string | null;
  decisionBranchTaken?: string | null;
  wouldEndDrain?: boolean;
  wouldReleaseNotificationScreen?: boolean;
  wouldRenderLobby?: boolean;
  wouldChooseNoShell?: boolean;
  wouldClearActiveChain?: boolean;
  wouldHideOverlay?: boolean;
  decisionInputs?: Record<string, unknown>;
};

type OwnerFalseWhileActiveCheckHooks = {
  readSnapshot: () => OwnerFalseWhileActiveCheckSnapshot;
};

const emptySnapshot = (): OwnerFalseWhileActiveCheckSnapshot => ({
  ownerHasPendingNotificationChain: false,
  legacyHasPendingNotificationChain: false,
  checkBanId: null,
  checkOverlayKey: null,
  shellKind: null,
  renderBranch: null,
  returnBranch: null,
  activeKind: null,
  activeBanId: null,
  ownerDisplayKind: null,
  ownerDisplayBanId: null,
  currentHeadKind: null,
  currentHeadId: null,
  checkPresentInQueues: false,
  ownerQueueLen: 0,
  ownerQueueKinds: [],
  ownerQueueIds: [],
  ownerQueueKeys: [],
  ownerPendingLen: 0,
  ownerPendingKinds: [],
  ownerPendingIds: [],
  ownerPendingKeys: [],
  overlayQueueRefLen: 0,
  overlayQueueRefKinds: [],
  overlayQueueRefIds: [],
  overlayQueueRefKeys: [],
  overlayQueueStateLen: 0,
  overlayQueueStateKinds: [],
  overlayQueueStateIds: [],
  overlayQueueStateKeys: [],
  activeNotificationChain: null,
  notificationOverlayVisible: null,
  queueClaimsNotificationScreen: null,
  visualQueueDimSessionLive: null,
  explicitDrainReason: null,
  drainSessionId: null,
  notificationChainTransitioning: null,
  sendFlowOpening: null,
  lobbyVisible: null,
  lobbyMounted: null,
});

let hooks: OwnerFalseWhileActiveCheckHooks | null = null;
const emittedDecisionKeys = new Set<string>();
const emittedBranchKeys = new Set<string>();
const storedDecisionTraceByKey = new Map<
  string,
  OwnerFalseWhileActiveCheckTraceSnapshot
>();

function queueKinds(queue: QueuedOverlay[]): string[] {
  return queue.map((item) => item.kind);
}

function queueIds(queue: QueuedOverlay[]): string[] {
  return queue
    .map((item) => queueHeadIdFrom(item))
    .filter((id): id is string => id != null);
}

function queueKeys(queue: QueuedOverlay[]): string[] {
  return queue.map((item) => overlayQueueKey(item));
}

function captureDecisionStack(): string {
  try {
    return new Error('OWNER_FALSE_WHILE_ACTIVE_CHECK_DECISION_TRACE').stack ?? '';
  } catch {
    return '';
  }
}

function captureBranchStack(): string {
  try {
    return new Error('OWNER_FALSE_WHILE_ACTIVE_CHECK_BRANCH_TAKEN_TRACE').stack ?? '';
  } catch {
    return '';
  }
}

function checkPresentInQueues(
  checkBanId: string | null,
  snap: Pick<
    OwnerFalseWhileActiveCheckSnapshot,
    | 'overlayQueueRefKinds'
    | 'overlayQueueRefIds'
    | 'overlayQueueRefKeys'
    | 'overlayQueueStateKinds'
    | 'overlayQueueStateIds'
    | 'overlayQueueStateKeys'
    | 'ownerQueueKinds'
    | 'ownerQueueIds'
    | 'ownerQueueKeys'
  >,
): boolean {
  if (!checkBanId) {
    return (
      snap.ownerQueueKinds.includes('check') ||
      snap.overlayQueueRefKinds.includes('check') ||
      snap.overlayQueueStateKinds.includes('check')
    );
  }
  const key = checkOverlayKey(checkBanId);
  const match = (kinds: string[], ids: string[], keys: string[]) =>
    kinds.includes('check') || ids.includes(checkBanId) || keys.includes(key);
  return (
    match(snap.ownerQueueKinds, snap.ownerQueueIds, snap.ownerQueueKeys) ||
    match(
      snap.overlayQueueRefKinds,
      snap.overlayQueueRefIds,
      snap.overlayQueueRefKeys,
    ) ||
    match(
      snap.overlayQueueStateKinds,
      snap.overlayQueueStateIds,
      snap.overlayQueueStateKeys,
    )
  );
}

function resolveCheckBanId(
  snap: OwnerFalseWhileActiveCheckSnapshot,
): string | null {
  if (snap.ownerDisplayKind === 'check' && snap.ownerDisplayBanId) {
    return snap.ownerDisplayBanId;
  }
  if (snap.activeKind === 'check' && snap.activeBanId) {
    return snap.activeBanId;
  }
  if (snap.currentHeadKind === 'check' && snap.currentHeadId) {
    return snap.currentHeadId;
  }
  const refCheckId =
    snap.overlayQueueRefIds[
      snap.overlayQueueRefKinds.findIndex((kind) => kind === 'check')
    ] ??
    snap.overlayQueueStateIds[
      snap.overlayQueueStateKinds.findIndex((kind) => kind === 'check')
    ] ??
    null;
  return refCheckId;
}

function isActiveCheck(snap: OwnerFalseWhileActiveCheckSnapshot): boolean {
  return (
    snap.shellKind === 'check' ||
    snap.renderBranch === 'shell-check' ||
    snap.ownerDisplayKind === 'check' ||
    snap.activeKind === 'check' ||
    snap.currentHeadKind === 'check' ||
    snap.overlayQueueRefKinds.includes('check') ||
    snap.overlayQueueStateKinds.includes('check')
  );
}

function shouldTraceMismatch(snap: OwnerFalseWhileActiveCheckSnapshot): boolean {
  if (snap.ownerHasPendingNotificationChain !== false) return false;
  if (snap.legacyHasPendingNotificationChain !== true) return false;
  if (!isActiveCheck(snap)) return false;
  if (
    !(
      snap.activeNotificationChain === true ||
      snap.notificationOverlayVisible === true
    )
  ) {
    return false;
  }
  return true;
}

function mergeSnapshot(
  patch?: Partial<OwnerFalseWhileActiveCheckSnapshot>,
): OwnerFalseWhileActiveCheckSnapshot {
  const base = hooks?.readSnapshot() ?? emptySnapshot();
  const merged: OwnerFalseWhileActiveCheckSnapshot = { ...base, ...patch };
  const checkBanId = resolveCheckBanId(merged);
  merged.checkBanId = checkBanId;
  merged.checkOverlayKey = checkBanId ? checkOverlayKey(checkBanId) : null;
  merged.checkPresentInQueues = checkPresentInQueues(checkBanId, merged);
  return merged;
}

function oneShotDecisionKey(
  decisionName: string,
  checkBanId: string | null,
): string {
  return `${decisionName}|${checkBanId ?? 'no-check'}`;
}

export function buildDecisionInputsFromSnapshot(
  snap: OwnerFalseWhileActiveCheckSnapshot,
  extras?: Record<string, unknown>,
): OwnerFalseWhileActiveCheckDecisionInputs {
  return {
    ownerHasPendingNotificationChain: snap.ownerHasPendingNotificationChain,
    legacyHasPendingNotificationChain: snap.legacyHasPendingNotificationChain,
    ownerQueueLen: snap.ownerQueueLen,
    ownerPendingLen: snap.ownerPendingLen,
    overlayQueueRefLen: snap.overlayQueueRefLen,
    overlayQueueStateLen: snap.overlayQueueStateLen,
    ownerQueueKinds: snap.ownerQueueKinds,
    ownerPendingKinds: snap.ownerPendingKinds,
    overlayQueueRefKinds: snap.overlayQueueRefKinds,
    overlayQueueStateKinds: snap.overlayQueueStateKinds,
    shellKind: snap.shellKind,
    renderBranch: snap.renderBranch,
    returnBranch: snap.returnBranch,
    activeKind: snap.activeKind,
    ownerDisplayKind: snap.ownerDisplayKind,
    currentHeadKind: snap.currentHeadKind,
    activeNotificationChain: snap.activeNotificationChain,
    notificationOverlayVisible: snap.notificationOverlayVisible,
    queueClaimsNotificationScreen: snap.queueClaimsNotificationScreen,
    visualQueueDimSessionLive: snap.visualQueueDimSessionLive,
    notificationChainTransitioning: snap.notificationChainTransitioning,
    explicitDrainReason: snap.explicitDrainReason,
    drainSessionId: snap.drainSessionId,
    checkPresentInOwnerQueue: snap.ownerQueueKinds.includes('check'),
    checkPresentInOwnerPending: snap.ownerPendingKinds.includes('check'),
    checkPresentInOverlayQueueRef: snap.overlayQueueRefKinds.includes('check'),
    checkPresentInOverlayQueueState:
      snap.overlayQueueStateKinds.includes('check'),
    sendFlowOpening: snap.sendFlowOpening,
    lobbyVisible: snap.lobbyVisible,
    lobbyMounted: snap.lobbyMounted,
    ...extras,
  };
}

function buildTraceSnapshot(
  snap: OwnerFalseWhileActiveCheckSnapshot,
  extras?: Record<string, unknown>,
): OwnerFalseWhileActiveCheckTraceSnapshot {
  return {
    ...snap,
    decisionInputs: buildDecisionInputsFromSnapshot(snap, extras),
  };
}

export function registerOwnerFalseWhileActiveCheckHooks(
  next: OwnerFalseWhileActiveCheckHooks | null,
): void {
  hooks = next;
}

export function buildOwnerFalseWhileActiveCheckQueueFields(input: {
  ownerQueue: QueuedOverlay[];
  ownerPending?: QueuedOverlay[];
  overlayQueueRef?: QueuedOverlay[];
  overlayQueueState?: QueuedOverlay[];
}): Pick<
  OwnerFalseWhileActiveCheckSnapshot,
  | 'ownerQueueLen'
  | 'ownerQueueKinds'
  | 'ownerQueueIds'
  | 'ownerQueueKeys'
  | 'ownerPendingLen'
  | 'ownerPendingKinds'
  | 'ownerPendingIds'
  | 'ownerPendingKeys'
  | 'overlayQueueRefLen'
  | 'overlayQueueRefKinds'
  | 'overlayQueueRefIds'
  | 'overlayQueueRefKeys'
  | 'overlayQueueStateLen'
  | 'overlayQueueStateKinds'
  | 'overlayQueueStateIds'
  | 'overlayQueueStateKeys'
> {
  const ownerPending = input.ownerPending ?? [];
  const overlayQueueRef = input.overlayQueueRef ?? [];
  const overlayQueueState = input.overlayQueueState ?? [];
  return {
    ownerQueueLen: input.ownerQueue.length,
    ownerQueueKinds: queueKinds(input.ownerQueue),
    ownerQueueIds: queueIds(input.ownerQueue),
    ownerQueueKeys: queueKeys(input.ownerQueue),
    ownerPendingLen: ownerPending.length,
    ownerPendingKinds: queueKinds(ownerPending),
    ownerPendingIds: queueIds(ownerPending),
    ownerPendingKeys: queueKeys(ownerPending),
    overlayQueueRefLen: overlayQueueRef.length,
    overlayQueueRefKinds: queueKinds(overlayQueueRef),
    overlayQueueRefIds: queueIds(overlayQueueRef),
    overlayQueueRefKeys: queueKeys(overlayQueueRef),
    overlayQueueStateLen: overlayQueueState.length,
    overlayQueueStateKinds: queueKinds(overlayQueueState),
    overlayQueueStateIds: queueIds(overlayQueueState),
    overlayQueueStateKeys: queueKeys(overlayQueueState),
  };
}

export function buildOwnerFalseWhileActiveCheckOwnerDisplayFields(owner: {
  queue: QueuedOverlay[];
  pending?: QueuedOverlay[];
  active: { kind: string | null; banId: string | null };
  display: {
    result?: { id: string } | null;
    incomingBan?: { id: string } | null;
    checkBan?: { id: string } | null;
  };
}): Pick<
  OwnerFalseWhileActiveCheckSnapshot,
  | 'activeKind'
  | 'activeBanId'
  | 'ownerDisplayKind'
  | 'ownerDisplayBanId'
  | 'currentHeadKind'
  | 'currentHeadId'
> {
  const head = owner.queue[0] ?? null;
  const display = resolveOwnerDisplayKindBanId(owner.display);
  return {
    activeKind: owner.active.kind,
    activeBanId: owner.active.banId,
    ownerDisplayKind: display.displayKind,
    ownerDisplayBanId: display.displayBanId,
    currentHeadKind: head?.kind ?? owner.active.kind,
    currentHeadId: head ? queueHeadIdFrom(head) : owner.active.banId,
  };
}

export function observeOwnerFalseWhileActiveCheckDecision(
  input: OwnerFalseWhileActiveCheckDecisionInput,
): void {
  if (!isClientDiagTraceEnvironment()) return;

  const snap = mergeSnapshot({
    ownerHasPendingNotificationChain: input.ownerHasPendingNotificationChain,
    legacyHasPendingNotificationChain: input.legacyHasPendingNotificationChain,
  });
  if (!shouldTraceMismatch(snap)) return;

  const key = oneShotDecisionKey(input.decisionName, snap.checkBanId);
  if (emittedDecisionKeys.has(key)) return;
  emittedDecisionKeys.add(key);

  const traceSnapshot = buildTraceSnapshot(snap, input.decisionInputs);
  storedDecisionTraceByKey.set(key, traceSnapshot);

  emitClientDiagTrace('OWNER_FALSE_WHILE_ACTIVE_CHECK_DECISION_TRACE', {
    timestamp: diagTraceNow(),
    decisionName: input.decisionName,
    selector: input.selector,
    source: input.source,
    reason: input.reason,
    calledFrom: input.calledFrom,
    stack: captureDecisionStack(),
    decisionInputs: traceSnapshot.decisionInputs,
    decisionResult: input.decisionResult ?? null,
    decisionBranchTaken: input.decisionBranchTaken ?? null,
    wouldEndDrain: input.wouldEndDrain ?? false,
    wouldReleaseNotificationScreen:
      input.wouldReleaseNotificationScreen ?? false,
    wouldRenderLobby: input.wouldRenderLobby ?? false,
    wouldChooseNoShell: input.wouldChooseNoShell ?? false,
    wouldClearActiveChain: input.wouldClearActiveChain ?? false,
    wouldHideOverlay: input.wouldHideOverlay ?? false,
    checkBanId: snap.checkBanId,
    checkOverlayKey: snap.checkOverlayKey,
    shellKind: snap.shellKind,
    renderBranch: snap.renderBranch,
    returnBranch: snap.returnBranch,
    activeKind: snap.activeKind,
    activeBanId: snap.activeBanId,
    ownerDisplayKind: snap.ownerDisplayKind,
    ownerDisplayBanId: snap.ownerDisplayBanId,
    currentHeadKind: snap.currentHeadKind,
    currentHeadId: snap.currentHeadId,
    checkPresentInQueues: snap.checkPresentInQueues,
    ownerQueueLen: snap.ownerQueueLen,
    ownerQueueKinds: snap.ownerQueueKinds,
    ownerQueueIds: snap.ownerQueueIds,
    ownerQueueKeys: snap.ownerQueueKeys,
    ownerPendingLen: snap.ownerPendingLen,
    ownerPendingKinds: snap.ownerPendingKinds,
    ownerPendingIds: snap.ownerPendingIds,
    ownerPendingKeys: snap.ownerPendingKeys,
    overlayQueueRefLen: snap.overlayQueueRefLen,
    overlayQueueRefKinds: snap.overlayQueueRefKinds,
    overlayQueueRefIds: snap.overlayQueueRefIds,
    overlayQueueRefKeys: snap.overlayQueueRefKeys,
    overlayQueueStateLen: snap.overlayQueueStateLen,
    overlayQueueStateKinds: snap.overlayQueueStateKinds,
    overlayQueueStateIds: snap.overlayQueueStateIds,
    overlayQueueStateKeys: snap.overlayQueueStateKeys,
    activeNotificationChain: snap.activeNotificationChain,
    notificationOverlayVisible: snap.notificationOverlayVisible,
    queueClaimsNotificationScreen: snap.queueClaimsNotificationScreen,
    visualQueueDimSessionLive: snap.visualQueueDimSessionLive,
    explicitDrainReason: snap.explicitDrainReason,
    drainSessionId: snap.drainSessionId,
    notificationChainTransitioning: snap.notificationChainTransitioning,
    sendFlowOpening: snap.sendFlowOpening,
    lobbyVisible: snap.lobbyVisible,
    lobbyMounted: snap.lobbyMounted,
  });
}

export function noteOwnerFalseWhileActiveCheckBranchTaken(input: {
  decisionName: string;
  branchTaken: string;
  source: string;
  reason: string;
  calledFrom: string;
  snapshotBefore?: Partial<OwnerFalseWhileActiveCheckSnapshot>;
  snapshotAfter?: Partial<OwnerFalseWhileActiveCheckSnapshot>;
  decisionInputs?: Record<string, unknown>;
  decisionInputsAfter?: Record<string, unknown>;
}): void {
  if (!isClientDiagTraceEnvironment()) return;

  const beforeSnap = mergeSnapshot(input.snapshotBefore);
  const decisionKey = oneShotDecisionKey(input.decisionName, beforeSnap.checkBanId);
  if (!emittedDecisionKeys.has(decisionKey)) return;

  const branchKey = `${decisionKey}|${input.branchTaken}`;
  if (emittedBranchKeys.has(branchKey)) return;

  const storedBefore = storedDecisionTraceByKey.get(decisionKey);
  if (!storedBefore && !shouldTraceMismatch(beforeSnap)) return;

  emittedBranchKeys.add(branchKey);

  const snapshotBefore =
    storedBefore ??
    buildTraceSnapshot(beforeSnap, {
      ...input.decisionInputs,
      branchTaken: input.branchTaken,
    });
  const afterSnap = mergeSnapshot(input.snapshotAfter);
  const snapshotAfter = buildTraceSnapshot(afterSnap, {
    ...snapshotBefore.decisionInputs,
    ...input.decisionInputsAfter,
    branchTaken: input.branchTaken,
  });

  emitClientDiagTrace('OWNER_FALSE_WHILE_ACTIVE_CHECK_BRANCH_TAKEN_TRACE', {
    timestamp: diagTraceNow(),
    decisionName: input.decisionName,
    branchTaken: input.branchTaken,
    source: input.source,
    reason: input.reason,
    calledFrom: input.calledFrom,
    stack: captureBranchStack(),
    decisionInputs: snapshotBefore.decisionInputs,
    snapshotBefore,
    snapshotAfter,
  });
}
