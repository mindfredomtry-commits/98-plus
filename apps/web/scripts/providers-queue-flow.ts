/**
 * Integration-style model of Providers notification consume flow.
 *
 * Step order (matches runtime commit):
 * 1. dismissCurrentOverlay — NOTIFICATION_DISMISSED + gates + remaining/promote
 * 2. applyOverlayQueue — owner/overlay/display apply
 * 3. continue — continueNotificationChainOrOpenLobby (no pending promote)
 */

export type OverlayKind = 'check' | 'result';

export type QueueItem = {
  kind: OverlayKind;
  banId: string;
};

export type ProvidersFlowState = {
  overlayQueue: QueueItem[];
  pending: QueueItem[];
  ownerQueue: QueueItem[];
  /** owner.active / chain active head */
  active: QueueItem | null;
  /** syncDisplayFromQueue / display payload head */
  displayHead: QueueItem | null;
  awaitingUser: boolean;
  chainAdvanceExplicit: boolean;
  checkAnswerInFlight: Set<string>;
};

export type FlowStepSnapshot = {
  step: 1 | 2 | 3;
  stepName:
    | 'dismissCurrentOverlay'
    | 'applyOverlayQueue'
    | 'continue';
  functionName: string;
  overlayLen: number;
  pendingLen: number;
  ownerLen: number;
  activeHead: string | null;
  displayHead: string | null;
};

export type TracedActionResult = {
  snapshots: FlowStepSnapshot[];
  /** First step where activeHead became null (if any). */
  activeHeadBecameNullAt: FlowStepSnapshot | null;
  activeHeadClearedBy: string | null;
};

function headId(item: QueueItem | null | undefined): string | null {
  return item ? `${item.kind}:${item.banId}` : null;
}

export function snapshotState(
  state: ProvidersFlowState,
  step: FlowStepSnapshot['step'],
  stepName: FlowStepSnapshot['stepName'],
  functionName: string,
): FlowStepSnapshot {
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

export function createFlowState(): ProvidersFlowState {
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

function syncActiveFromOwnerQueue(state: ProvidersFlowState): void {
  state.active = state.ownerQueue[0] ?? null;
}

/** Explicit drain markers (subset of notification-chain-explicit-drain). */
function isExplicitContinueSource(source: string): boolean {
  const markers = [
    'user-answer',
    'dismiss:',
    'result-dismiss',
    'status-cta',
    'go-to-bans',
    'lobby-bans',
  ];
  return markers.some((m) => source.includes(m));
}

/**
 * startLobbyBansNotificationDrain:
 * first card → overlay + owner, remainder → pending.
 */
export function startLobbyBansNotificationDrain(
  state: ProvidersFlowState,
  cards: QueueItem[],
): void {
  if (cards.length === 0) return;
  state.overlayQueue = [cards[0]!];
  state.ownerQueue = [cards[0]!];
  state.pending = cards.slice(1);
  state.active = cards[0]!;
  state.displayHead = cards[0]!;
  state.awaitingUser = true;
  state.chainAdvanceExplicit = true;
}

/**
 * Step 1 body: NOTIFICATION_DISMISSED + gates + remaining/promote prep.
 * Does not apply queue or continue.
 * Returns remaining to apply, or null if early-return / defer-clear.
 */
function dismissCurrentOverlayPrepare(
  state: ProvidersFlowState,
  reason: string,
  nextQueue: QueueItem[] | undefined,
  dismissBanId: string,
): { remainingToApply: QueueItem[] | null; deferredClear: boolean } {
  const prev =
    state.ownerQueue.length > 0 ? state.ownerQueue : state.overlayQueue;
  const remaining = nextQueue ?? prev.slice(1);

  // NOTIFICATION_DISMISSED (owner sync)
  state.ownerQueue = popQueueHeadForBan(state.ownerQueue, dismissBanId);
  if (state.active?.banId === dismissBanId) {
    state.active = null;
  }
  syncActiveFromOwnerQueue(state);
  // APPLY_DISPLAY effect from owner: display follows owner active
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

/**
 * Step 2: applyOverlayQueue / applyQueueViaOwnerAuthority + syncDisplayFromQueue.
 */
function applyOverlayQueue(
  state: ProvidersFlowState,
  next: QueueItem[],
): void {
  state.overlayQueue = [...next];
  state.ownerQueue = [...next];
  state.active = next[0] ?? null;
  // syncDisplayFromQueue
  state.displayHead = next[0] ?? null;
  state.chainAdvanceExplicit = false;
  if (state.active) {
    state.awaitingUser = true;
  } else {
    state.awaitingUser = false;
  }
}

/**
 * Step 3: continueNotificationChainOrOpenLobby.
 * Modeled as continue → showNextNotificationFromChainSync advance (pop).
 */
function continueNotificationChainOrOpenLobby(
  state: ProvidersFlowState,
  source: string,
): string {
  if (
    !isExplicitContinueSource(source) &&
    state.awaitingUser &&
    !state.chainAdvanceExplicit
  ) {
    return 'blocked';
  }

  if (state.overlayQueue.length === 0) {
    state.active = null;
    state.displayHead = null;
    state.awaitingUser = false;
    state.chainAdvanceExplicit = false;
    return 'continueNotificationChainOrOpenLobby:empty-overlay-no-promote';
  }

  // showNextNotificationFromChainSync-shaped advance (pop current head)
  state.overlayQueue = state.overlayQueue.slice(1);
  state.ownerQueue = state.ownerQueue.slice(1);
  state.active = state.overlayQueue[0] ?? null;
  state.displayHead = state.active;
  if (state.active) {
    state.awaitingUser = true;
    state.chainAdvanceExplicit = true;
    return 'showNextNotificationFromChainSync:pop-advance';
  }
  state.awaitingUser = false;
  state.chainAdvanceExplicit = false;
  return 'showNextNotificationFromChainSync:pop-advance-empty';
}

function runTracedDismissPipeline(
  state: ProvidersFlowState,
  reason: string,
  nextQueue: QueueItem[] | undefined,
  dismissBanId: string,
): TracedActionResult {
  const snapshots: FlowStepSnapshot[] = [];
  let activeHeadBecameNullAt: FlowStepSnapshot | null = null;
  let activeHeadClearedBy: string | null = null;
  const activeBefore = headId(state.active);

  const noteNull = (snap: FlowStepSnapshot, fn: string) => {
    if (
      activeHeadBecameNullAt == null &&
      activeBefore != null &&
      snap.activeHead == null
    ) {
      activeHeadBecameNullAt = snap;
      activeHeadClearedBy = fn;
    }
  };

  // --- step 1: dismissCurrentOverlay (prepare only) ---
  const prep = dismissCurrentOverlayPrepare(
    state,
    reason,
    nextQueue,
    dismissBanId,
  );
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
  const snap1 = snapshotState(
    state,
    1,
    'dismissCurrentOverlay',
    step1Fn,
  );
  snapshots.push(snap1);
  noteNull(snap1, step1Fn);

  // --- step 2: applyOverlayQueue ---
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
  noteNull(snap2, step2Fn);

  // --- step 3: continue ---
  const continueFn = continueNotificationChainOrOpenLobby(
    state,
    `dismiss:${reason}`,
  );
  const step3Fn = `continueNotificationChainOrOpenLobby→${continueFn}`;
  const snap3 = snapshotState(state, 3, 'continue', step3Fn);
  snapshots.push(snap3);
  noteNull(snap3, step3Fn);

  return { snapshots, activeHeadBecameNullAt, activeHeadClearedBy };
}

/** Check first-answer consume with per-step snapshots. */
export function actionCheckFirstAnswerTraced(
  state: ProvidersFlowState,
  banId: string,
): TracedActionResult {
  const remaining = removeOverlaysForBan(state.overlayQueue, banId, ['check']);
  state.checkAnswerInFlight.add(banId);
  const traced = runTracedDismissPipeline(
    state,
    'user-answer',
    remaining,
    banId,
  );
  state.checkAnswerInFlight.delete(banId);
  return traced;
}

/** Result «К запретам» with per-step snapshots. */
export function actionResultGoToBansTraced(
  state: ProvidersFlowState,
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

  return runTracedDismissPipeline(
    state,
    'result-dismiss',
    nextQueue,
    banId,
  );
}

export function actionCheckFirstAnswer(
  state: ProvidersFlowState,
  banId: string,
): void {
  actionCheckFirstAnswerTraced(state, banId);
}

export function actionResultGoToBans(
  state: ProvidersFlowState,
  banId: string,
): void {
  actionResultGoToBansTraced(state, banId);
}

export function hasRemainingWork(state: ProvidersFlowState): boolean {
  return state.overlayQueue.length > 0 || state.pending.length > 0;
}

export function assertHeadAliveWhileWorkRemains(
  state: ProvidersFlowState,
  stepLabel: string,
): void {
  if (!hasRemainingWork(state)) return;
  if (state.active != null) return;
  const detail =
    `${stepLabel}: active head is null while work remains ` +
    `(overlayLen=${state.overlayQueue.length}, pendingLen=${state.pending.length}, ` +
    `ownerLen=${state.ownerQueue.length})`;
  throw new Error(detail);
}

export function formatSnapshot(snap: FlowStepSnapshot): string {
  return (
    `step ${snap.step}: ${snap.stepName}()\n` +
    `  function: ${snap.functionName}\n` +
    `  overlayLen=${snap.overlayLen} pendingLen=${snap.pendingLen} ownerLen=${snap.ownerLen}\n` +
    `  activeHead=${snap.activeHead ?? 'null'} displayHead=${snap.displayHead ?? 'null'}`
  );
}
