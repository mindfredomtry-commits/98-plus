/**
 * Runtime-faithful Providers consume model (no UI).
 *
 * Matches real path:
 * 1. dismissCurrentOverlay — NOTIFICATION_DISMISSED, promote pending if needed, applyOverlayQueue
 * 2. continueNotificationChainOrOpenLobby → showNextNotificationFromChainSync
 *
 * showNextNotificationFromChainSync (runtime):
 * - resolveShowNextHeadDecision reads current head (no pop)
 * - if pending non-empty, mergeStartupIntoOverlayQueueOnly may promote into overlay
 * - syncDisplayFromQueue shows that head
 * - queue is NOT mutated via slice/pop
 *
 * Do not use providers-queue-flow.ts (pop model) for fixes.
 */

export type OverlayKind = 'check' | 'result';

export type QueueItem = {
  kind: OverlayKind;
  banId: string;
};

export type RuntimeFlowState = {
  overlayQueue: QueueItem[];
  pending: QueueItem[];
  ownerQueue: QueueItem[];
  active: QueueItem | null;
  displayHead: QueueItem | null;
  awaitingUser: boolean;
  chainAdvanceExplicit: boolean;
  checkAnswerInFlight: Set<string>;
};

export type StepSnapshot = {
  step: 1 | 2 | 3;
  stepName: 'dismissCurrentOverlay' | 'applyOverlayQueue' | 'showNextNotificationFromChainSync';
  functionName: string;
  overlayLen: number;
  pendingLen: number;
  ownerLen: number;
  activeHead: string | null;
  displayHead: string | null;
};

export type TracedActionResult = {
  snapshots: StepSnapshot[];
  activeHeadBecameNullAt: StepSnapshot | null;
  activeHeadClearedBy: string | null;
  showNextReturned: boolean;
};

function headId(item: QueueItem | null | undefined): string | null {
  return item ? `${item.kind}:${item.banId}` : null;
}

export function snapshotState(
  state: RuntimeFlowState,
  step: StepSnapshot['step'],
  stepName: StepSnapshot['stepName'],
  functionName: string,
): StepSnapshot {
  return {
    step,
    stepName,
    functionName,
    overlayLen: state.overlayQueue.length,
    pendingLen: state.pending.length,
    ownerLen: state.ownerQueue.length,
    activeHead: headId(state.active),
    displayHead: headId(state.displayHead),
  };
}

export function formatSnapshot(snap: StepSnapshot): string {
  return (
    `step ${snap.step}: ${snap.stepName}()\n` +
    `  function: ${snap.functionName}\n` +
    `  overlayLen=${snap.overlayLen} pendingLen=${snap.pendingLen} ownerLen=${snap.ownerLen}\n` +
    `  activeHead=${snap.activeHead ?? 'null'} displayHead=${snap.displayHead ?? 'null'}`
  );
}

export function createRuntimeFlowState(): RuntimeFlowState {
  return {
    overlayQueue: [],
    pending: [],
    ownerQueue: [],
    active: null,
    displayHead: null,
    awaitingUser: false,
    chainAdvanceExplicit: false,
    checkAnswerInFlight: new Set(),
  };
}

export function promotePendingIfOverlayEmpty(state: {
  overlayQueue: QueueItem[];
  pending: QueueItem[];
}): { overlayQueue: QueueItem[]; pending: QueueItem[] } {
  if (state.overlayQueue.length > 0) return state;
  if (state.pending.length === 0) return state;
  return {
    overlayQueue: [...state.pending],
    pending: [],
  };
}

function removeOverlaysForBan(
  queue: QueueItem[],
  banId: string,
  kinds: OverlayKind[],
): QueueItem[] {
  return queue.filter((q) => {
    if (q.banId !== banId) return true;
    return !kinds.includes(q.kind);
  });
}

function popQueueHeadForBan(
  queue: QueueItem[],
  banId: string | null,
): QueueItem[] {
  if (queue.length === 0) return queue;
  const head = queue[0]!;
  if (banId && head.banId !== banId) return queue;
  return queue.slice(1);
}

/** resolveShowNextHeadDecision (owner-authoritative, fallback legacy). */
export function resolveShowNextHeadDecision(state: RuntimeFlowState): {
  head: QueueItem | null;
  startupHead: QueueItem | null;
  overlayLen: number;
  startupLen: number;
  hasNext: boolean;
  nextKind: OverlayKind | null;
  nextBanId: string | null;
} {
  const ownerQueue = state.ownerQueue;
  const ownerPending = state.pending;
  const legacyQueue = state.overlayQueue;
  const legacyPending = state.pending;

  const head = ownerQueue[0] ?? legacyQueue[0] ?? null;
  const startupHead = ownerPending[0] ?? legacyPending[0] ?? null;
  const overlayLen = Math.max(ownerQueue.length, legacyQueue.length);
  const startupLen = Math.max(ownerPending.length, legacyPending.length);
  const hasNext = overlayLen > 0 || startupLen > 0;
  const chosen = head ?? startupHead;
  return {
    head,
    startupHead,
    overlayLen,
    startupLen,
    hasNext,
    nextKind: chosen?.kind ?? null,
    nextBanId: chosen?.banId ?? null,
  };
}

/**
 * mergeStartupIntoOverlayQueueOnly (simplified runtime):
 * when overlay/owner queue empty and pending non-empty, move pending → overlay.
 * Does not pop an existing head.
 */
function mergeStartupIntoOverlayQueueOnly(state: RuntimeFlowState): number {
  if (state.overlayQueue.length > 0 || state.ownerQueue.length > 0) {
    return 0;
  }
  if (state.pending.length === 0) return 0;
  const promoted = [...state.pending];
  state.overlayQueue = promoted;
  state.ownerQueue = promoted;
  state.pending = [];
  return promoted.length;
}

/** applyOverlayQueue + syncDisplayFromQueue */
function applyOverlayQueue(state: RuntimeFlowState, next: QueueItem[]): void {
  state.overlayQueue = [...next];
  state.ownerQueue = [...next];
  state.active = next[0] ?? null;
  state.displayHead = next[0] ?? null;
  state.chainAdvanceExplicit = false;
  state.awaitingUser = state.active != null;
}

/**
 * showNextNotificationFromChainSync — runtime-faithful:
 * read head, optional pending merge, display head, NO slice/pop.
 */
function showNextNotificationFromChainSync(
  state: RuntimeFlowState,
  _source: string,
): boolean {
  const decision = resolveShowNextHeadDecision(state);
  if (!decision.hasNext) {
    return false;
  }

  // Runtime: if (startupLen > 0) mergeStartupIntoOverlayQueueOnly(source)
  if (decision.startupLen > 0) {
    mergeStartupIntoOverlayQueueOnly(state);
  }

  const headAfterMerge =
    state.overlayQueue[0] ?? state.ownerQueue[0] ?? state.pending[0] ?? null;
  if (!headAfterMerge) {
    return false;
  }

  // syncDisplayFromQueue(overlayQueueRef.current) — display current head, no pop
  state.active = headAfterMerge;
  state.displayHead = headAfterMerge;
  state.awaitingUser = true;
  state.chainAdvanceExplicit = false;
  return true;
}

/**
 * continueNotificationChainOrOpenLobby → showNext when local items exist.
 */
function continueNotificationChainOrOpenLobby(
  state: RuntimeFlowState,
  source: string,
): { shown: boolean; branch: string } {
  const hasLocalItems =
    state.overlayQueue.length > 0 ||
    state.pending.length > 0 ||
    state.ownerQueue.length > 0;
  if (!hasLocalItems) {
    return { shown: false, branch: 'no-local-items' };
  }
  const shown = showNextNotificationFromChainSync(state, source);
  return {
    shown,
    branch: shown
      ? 'showNextNotificationFromChainSync:show-next-success'
      : 'showNextNotificationFromChainSync:return-false',
  };
}

function dismissPrepare(
  state: RuntimeFlowState,
  reason: string,
  nextQueue: QueueItem[] | undefined,
  dismissBanId: string,
): { remainingToApply: QueueItem[] | null; deferredClear: boolean } {
  const prev =
    state.ownerQueue.length > 0 ? state.ownerQueue : state.overlayQueue;
  const remaining = nextQueue ?? prev.slice(1);

  // NOTIFICATION_DISMISSED
  state.ownerQueue = popQueueHeadForBan(state.ownerQueue, dismissBanId);
  if (state.active?.banId === dismissBanId) {
    state.active = null;
  }
  state.active = state.ownerQueue[0] ?? null;
  state.displayHead = state.active;

  if (reason === 'user-answer') {
    state.chainAdvanceExplicit = true;
  }

  if (
    state.awaitingUser &&
    remaining.length > 0 &&
    !state.chainAdvanceExplicit
  ) {
    return { remainingToApply: null, deferredClear: false };
  }

  const promoted = promotePendingIfOverlayEmpty({
    overlayQueue: remaining,
    pending: state.pending,
  });

  const deferCheckEmpty =
    reason === 'user-answer' &&
    promoted.overlayQueue.length === 0 &&
    state.checkAnswerInFlight.has(dismissBanId);

  if (deferCheckEmpty) {
    return { remainingToApply: null, deferredClear: true };
  }

  if (state.pending.length > 0 && promoted.pending.length === 0) {
    state.pending = [];
  }
  return { remainingToApply: promoted.overlayQueue, deferredClear: false };
}

function runTracedPipeline(
  state: RuntimeFlowState,
  reason: string,
  nextQueue: QueueItem[] | undefined,
  dismissBanId: string,
): TracedActionResult {
  const snapshots: StepSnapshot[] = [];
  let activeHeadBecameNullAt: StepSnapshot | null = null;
  let activeHeadClearedBy: string | null = null;
  const activeBefore = headId(state.active);

  const prep = dismissPrepare(state, reason, nextQueue, dismissBanId);
  let step1Fn = 'dismissCurrentOverlay+NOTIFICATION_DISMISSED/owner-sync';
  if (prep.deferredClear) {
    state.overlayQueue = [];
    state.ownerQueue = [];
    state.active = null;
    state.displayHead = null;
    state.chainAdvanceExplicit = false;
    state.awaitingUser = false;
    step1Fn =
      'dismissCurrentOverlay:deferCheckEmpty/writeOverlayQueueSilent([])';
  }
  const snap1 = snapshotState(state, 1, 'dismissCurrentOverlay', step1Fn);
  snapshots.push(snap1);

  let step2Fn = 'applyOverlayQueue(skipped)';
  if (prep.remainingToApply != null) {
    applyOverlayQueue(state, prep.remainingToApply);
    step2Fn =
      prep.remainingToApply.length === 0
        ? 'applyOverlayQueue([])'
        : 'applyOverlayQueue(remaining)';
  } else if (prep.deferredClear) {
    step2Fn = 'applyOverlayQueue(skipped-deferred-clear)';
  } else {
    step2Fn = 'applyOverlayQueue(skipped-early-return)';
  }
  const snap2 = snapshotState(state, 2, 'applyOverlayQueue', step2Fn);
  snapshots.push(snap2);

  const cont = continueNotificationChainOrOpenLobby(
    state,
    `dismiss:${reason}`,
  );
  const step3Fn = `continueNotificationChainOrOpenLobby→${cont.branch}`;
  const snap3 = snapshotState(
    state,
    3,
    'showNextNotificationFromChainSync',
    step3Fn,
  );
  snapshots.push(snap3);

  // Only report null that survives the full pipeline while work remains.
  const workRemains =
    state.overlayQueue.length > 0 ||
    state.pending.length > 0 ||
    state.ownerQueue.length > 0;
  if (activeBefore != null && state.active == null && workRemains) {
    for (const snap of snapshots) {
      if (snap.activeHead == null) {
        activeHeadBecameNullAt = snap;
        activeHeadClearedBy = snap.functionName;
        break;
      }
    }
  }

  return {
    snapshots,
    activeHeadBecameNullAt,
    activeHeadClearedBy,
    showNextReturned: cont.shown,
  };
}

export function actionCheckFirstAnswerRuntimeTraced(
  state: RuntimeFlowState,
  banId: string,
): TracedActionResult {
  const remaining = removeOverlaysForBan(state.overlayQueue, banId, ['check']);
  state.checkAnswerInFlight.add(banId);
  const traced = runTracedPipeline(state, 'user-answer', remaining, banId);
  state.checkAnswerInFlight.delete(banId);
  return traced;
}

export function actionResultGoToBansRuntimeTraced(
  state: RuntimeFlowState,
  banId: string,
): TracedActionResult {
  state.chainAdvanceExplicit = true;
  state.awaitingUser = false;

  let nextQueue = removeOverlaysForBan(state.overlayQueue, banId, ['result']);
  const promoted = promotePendingIfOverlayEmpty({
    overlayQueue: nextQueue,
    pending: state.pending,
  });
  if (state.pending.length > 0 && promoted.pending.length === 0) {
    state.pending = [];
  }
  nextQueue = promoted.overlayQueue;

  return runTracedPipeline(state, 'result-dismiss', nextQueue, banId);
}

export function hasRemainingWork(state: RuntimeFlowState): boolean {
  return (
    state.overlayQueue.length > 0 ||
    state.pending.length > 0 ||
    state.ownerQueue.length > 0
  );
}

export function assertHeadAliveWhileWorkRemains(
  state: RuntimeFlowState,
  stepLabel: string,
): void {
  if (!hasRemainingWork(state)) return;
  if (state.active != null && state.displayHead != null) return;
  throw new Error(
    `${stepLabel}: active/display head null while work remains ` +
      `(overlayLen=${state.overlayQueue.length}, pendingLen=${state.pending.length}, ` +
      `ownerLen=${state.ownerQueue.length}, activeHead=${headId(state.active)}, ` +
      `displayHead=${headId(state.displayHead)})`,
  );
}

/** Invariant: showNext must not shrink overlay by pop. */
export function assertShowNextDidNotPop(
  overlayLenBeforeShowNext: number,
  overlayLenAfterShowNext: number,
  stepLabel: string,
): void {
  if (overlayLenAfterShowNext < overlayLenBeforeShowNext) {
    throw new Error(
      `${stepLabel}: showNext must not pop head ` +
        `(overlayLen ${overlayLenBeforeShowNext} → ${overlayLenAfterShowNext})`,
    );
  }
}
