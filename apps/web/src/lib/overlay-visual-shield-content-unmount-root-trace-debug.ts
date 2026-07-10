'use client';

import { checkOverlayKey } from '@/lib/overlay-queue';
import { diagTraceNow, isClientDiagTraceEnvironment } from '@/lib/diag-trace-client';
import { readShellCheckActionMarkers } from '@/lib/shell-check-lifecycle-trace-debug';
import { readCheckOverlayParentReturnedBranch } from '@/lib/check-overlay-parent-return-branch-trace-debug';

export type OverlayVisualShieldContentValueSourceType =
  | 'state-write'
  | 'ref-write'
  | 'derived-value'
  | 'mount-state'
  | 'host-state'
  | 'session-state'
  | 'unknown';

export type OverlayVisualShieldContentUnmountRootCause =
  | 'visual-shield-host-unmounted'
  | 'visual-shield-session-closed'
  | 'visual-dim-session-released'
  | 'card-content-mount-flag-cleared'
  | 'parent-remounted'
  | 'overlay-host-stopped-emitting'
  | 'queue-cleared'
  | 'active-chain-cleared'
  | 'explicit-dismiss'
  | 'derived-input-changed'
  | 'unknown';

export type OverlayVisualShieldUnmountWatchMissedReason =
  | 'no-previous-snapshot'
  | 'previous-value-already-false'
  | 'missing-current-check-key'
  | 'previous-key-mismatch'
  | 'watch-never-armed'
  | 'watch-reset-before-transition'
  | 'check-not-recognized-as-active'
  | 'expected-exit-marker-blocked'
  | 'root-trace-deduped'
  | 'observer-not-called-on-false-render'
  | 'module-reinitialized'
  | 'unknown';

export type OverlayVisualShieldContentTransitionSnapshot = {
  shellKind: string | null;
  renderBranch: string | null;
  returnedBranch: string | null;
  notificationOverlayVisible: boolean;
  activeNotificationChain: boolean;
  visualQueueDimSessionLive: boolean;
  globalOverlayHostActive: boolean;
  overlaySessionOpen: boolean;
  cardContentMounted: boolean;
  hostMounted: boolean;
  queueLen: number;
  ownerQueueLen: number;
  checkBanId: string | null;
  shouldMountNotificationOverlayHostFromGuards: boolean;
  showDirectOverboardLayer: boolean;
  parentMountId: string;
  composeBlocksNotificationHost: boolean;
};

export type OverlayVisualShieldContentUnmountRootInput = {
  source: string;
  reason: string;
  calledFrom: string;
  nextCardContentMounted: boolean;
  snapshotAfter: OverlayVisualShieldContentTransitionSnapshot;
  derivation: {
    valueSourceType: OverlayVisualShieldContentValueSourceType;
    exactWriterOrDerivation: string;
    exactSourceFile: string;
    exactSourceFunction: string;
    exactSourceLine: string;
    operands: {
      shouldMountNotificationOverlayHostFromGuards: boolean;
      showDirectOverboardLayer: boolean;
    };
  };
};

type KeyWatchState = {
  observerCallCount: number;
  firstObservedValue: boolean | null;
  lastObservedValue: boolean | null;
  armed: boolean;
  armedParentMountId: string | null;
};

const rootEmittedKeys = new Set<string>();
const missedEmittedKeys = new Set<string>();
const watchByKey = new Map<string, KeyWatchState>();

let previousSnapshot: OverlayVisualShieldContentTransitionSnapshot | null = null;
let previousOperands: OverlayVisualShieldContentUnmountRootInput['derivation']['operands'] | null =
  null;
let previousParentMountId: string | null = null;

function resolveOverlayKey(
  checkBanId: string | null | undefined,
): string | null {
  const banId = checkBanId?.trim() || null;
  return banId ? checkOverlayKey(banId) : null;
}

function hasExpectedExitMarkersFalse(): boolean {
  const markers = readShellCheckActionMarkers();
  return (
    !markers.userPressedCheckYes &&
    !markers.userPressedCheckNo &&
    !markers.submitCheckAnswerStarted &&
    !markers.checkDismissStarted &&
    !markers.checkConsumed &&
    !markers.resultArrivedAfterCheck
  );
}

function checkWasActiveInSnapshot(
  snapshot: OverlayVisualShieldContentTransitionSnapshot | null,
): boolean {
  if (!snapshot) return false;
  const returnedBranch = readCheckOverlayParentReturnedBranch('queue-shell');
  return (
    snapshot.shellKind === 'check' ||
    snapshot.renderBranch === 'shell-check' ||
    returnedBranch === 'check-overlay' ||
    snapshot.returnedBranch === 'check-overlay'
  );
}

function getOrCreateWatchState(key: string): KeyWatchState {
  const existing = watchByKey.get(key);
  if (existing) return existing;
  const created: KeyWatchState = {
    observerCallCount: 0,
    firstObservedValue: null,
    lastObservedValue: null,
    armed: false,
    armedParentMountId: null,
  };
  watchByKey.set(key, created);
  return created;
}

function updateWatchState(
  key: string | null,
  nextValue: boolean,
  snapshot: OverlayVisualShieldContentTransitionSnapshot,
): KeyWatchState | null {
  if (!key) return null;
  const watch = getOrCreateWatchState(key);
  watch.observerCallCount += 1;
  if (watch.firstObservedValue === null) {
    watch.firstObservedValue = nextValue;
  }
  watch.lastObservedValue = nextValue;
  if (nextValue && checkWasActiveInSnapshot(snapshot)) {
    watch.armed = true;
    watch.armedParentMountId = snapshot.parentMountId;
  }
  return watch;
}

function resolveFirstChangedOperand(
  before: OverlayVisualShieldContentUnmountRootInput['derivation']['operands'],
  after: OverlayVisualShieldContentUnmountRootInput['derivation']['operands'],
): string | null {
  if (
    before.shouldMountNotificationOverlayHostFromGuards !==
    after.shouldMountNotificationOverlayHostFromGuards
  ) {
    return 'shouldMountNotificationOverlayHostFromGuards';
  }
  if (before.showDirectOverboardLayer !== after.showDirectOverboardLayer) {
    return 'showDirectOverboardLayer';
  }
  return null;
}

function buildCausalFlags(input: {
  before: OverlayVisualShieldContentTransitionSnapshot;
  after: OverlayVisualShieldContentTransitionSnapshot;
  firstChangedOperand: string | null;
}): {
  hostUnmounted: boolean;
  overlaySessionClosed: boolean;
  visualDimSessionReleased: boolean;
  cardContentMountFlagCleared: boolean;
  parentRemounted: boolean;
  overlayHostStoppedEmitting: boolean;
  resultBranchWon: boolean;
  explicitDismiss: boolean;
  queueCleared: boolean;
  activeChainCleared: boolean;
} {
  const markers = readShellCheckActionMarkers();
  return {
    hostUnmounted: input.before.hostMounted && !input.after.hostMounted,
    overlaySessionClosed:
      input.before.overlaySessionOpen && !input.after.overlaySessionOpen,
    visualDimSessionReleased:
      input.before.visualQueueDimSessionLive &&
      !input.after.visualQueueDimSessionLive,
    cardContentMountFlagCleared:
      input.before.shouldMountNotificationOverlayHostFromGuards &&
      !input.after.shouldMountNotificationOverlayHostFromGuards,
    parentRemounted: input.before.parentMountId !== input.after.parentMountId,
    overlayHostStoppedEmitting:
      input.before.globalOverlayHostActive &&
      !input.after.globalOverlayHostActive,
    resultBranchWon:
      input.after.shellKind === 'result' ||
      input.after.returnedBranch === 'result-overlay',
    explicitDismiss:
      markers.userPressedCheckYes ||
      markers.userPressedCheckNo ||
      markers.submitCheckAnswerStarted ||
      markers.checkDismissStarted ||
      markers.checkConsumed ||
      markers.resultArrivedAfterCheck,
    queueCleared:
      input.before.ownerQueueLen > 0 && input.after.ownerQueueLen === 0,
    activeChainCleared:
      input.before.activeNotificationChain &&
      !input.after.activeNotificationChain,
  };
}

function resolveRootCause(input: {
  flags: ReturnType<typeof buildCausalFlags>;
  firstChangedOperand: string | null;
}): OverlayVisualShieldContentUnmountRootCause {
  if (input.flags.overlayHostStoppedEmitting) {
    return 'overlay-host-stopped-emitting';
  }
  if (input.flags.overlaySessionClosed) {
    return 'visual-shield-session-closed';
  }
  if (input.flags.visualDimSessionReleased) {
    return 'visual-dim-session-released';
  }
  if (input.flags.cardContentMountFlagCleared) {
    return 'card-content-mount-flag-cleared';
  }
  if (input.flags.hostUnmounted) {
    return 'visual-shield-host-unmounted';
  }
  if (input.flags.queueCleared) {
    return 'queue-cleared';
  }
  if (input.flags.activeChainCleared) {
    return 'active-chain-cleared';
  }
  if (input.flags.parentRemounted) {
    return 'parent-remounted';
  }
  if (input.flags.explicitDismiss) {
    return 'explicit-dismiss';
  }
  if (input.firstChangedOperand) {
    return 'derived-input-changed';
  }
  return 'unknown';
}

function resolveMissedReason(input: {
  before: OverlayVisualShieldContentTransitionSnapshot | null;
  after: OverlayVisualShieldContentTransitionSnapshot;
  overlayKey: string | null;
  watch: KeyWatchState | null;
  expectedExitMarkersAllFalse: boolean;
  checkWasActiveBefore: boolean;
  rootTraceAlreadyEmitted: boolean;
  previousSnapshotWasReset: boolean;
  moduleWasReinitialized: boolean;
}): OverlayVisualShieldUnmountWatchMissedReason {
  if (!input.expectedExitMarkersAllFalse) {
    return 'expected-exit-marker-blocked';
  }
  if (!input.overlayKey) {
    return 'missing-current-check-key';
  }
  if (input.rootTraceAlreadyEmitted) {
    return 'root-trace-deduped';
  }
  if (input.moduleWasReinitialized) {
    return 'module-reinitialized';
  }
  if (!input.before) {
    return 'no-previous-snapshot';
  }
  if (!input.checkWasActiveBefore) {
    return 'check-not-recognized-as-active';
  }
  if (input.watch && !input.watch.armed) {
    if (input.watch.firstObservedValue === false) {
      return 'previous-value-already-false';
    }
    return 'watch-never-armed';
  }
  if (
    input.watch?.armedParentMountId &&
    input.watch.armedParentMountId !== input.after.parentMountId
  ) {
    return 'watch-reset-before-transition';
  }
  if (
    input.before.checkBanId &&
    input.after.checkBanId &&
    resolveOverlayKey(input.before.checkBanId) !== input.overlayKey
  ) {
    return 'previous-key-mismatch';
  }
  if (input.before.cardContentMounted === false) {
    return 'previous-value-already-false';
  }
  if (input.previousSnapshotWasReset) {
    return 'watch-reset-before-transition';
  }
  if (input.before.cardContentMounted === true && input.after.cardContentMounted === false) {
    return 'observer-not-called-on-false-render';
  }
  return 'unknown';
}

function maybeEmitRootTrace(input: {
  before: OverlayVisualShieldContentTransitionSnapshot;
  after: OverlayVisualShieldContentTransitionSnapshot;
  beforeOperands: OverlayVisualShieldContentUnmountRootInput['derivation']['operands'] | null;
  nextCardContentMounted: boolean;
  source: string;
  reason: string;
  calledFrom: string;
  derivation: OverlayVisualShieldContentUnmountRootInput['derivation'];
}): void {
  const previousValue = input.before.cardContentMounted;
  const nextValue = input.nextCardContentMounted;
  if (!(previousValue === true && nextValue === false)) return;
  if (!checkWasActiveInSnapshot(input.before)) return;
  if (!hasExpectedExitMarkersFalse()) return;

  const checkBanId =
    input.before.checkBanId?.trim() || input.after.checkBanId?.trim() || null;
  const overlayKey = resolveOverlayKey(checkBanId);
  if (!overlayKey) return;
  if (rootEmittedKeys.has(overlayKey)) return;
  rootEmittedKeys.add(overlayKey);

  const firstChangedOperand =
    input.beforeOperands != null
      ? resolveFirstChangedOperand(input.beforeOperands, input.derivation.operands)
      : null;
  const flags = buildCausalFlags({
    before: input.before,
    after: input.after,
    firstChangedOperand,
  });

  console.error('OVERLAY_VISUAL_SHIELD_CONTENT_UNMOUNT_ROOT_TRACE', {
    timestamp: diagTraceNow(),
    checkBanId,
    checkOverlayKey: overlayKey,
    previousValue,
    nextValue,
    source: input.source,
    reason: input.reason,
    calledFrom: input.calledFrom,
    valueSourceType: input.derivation.valueSourceType,
    exactWriterOrDerivation: input.derivation.exactWriterOrDerivation,
    exactSourceFile: input.derivation.exactSourceFile,
    exactSourceFunction: input.derivation.exactSourceFunction,
    exactSourceLine: input.derivation.exactSourceLine,
    firstChangedOperand,
    ROOT_CAUSE: resolveRootCause({ flags, firstChangedOperand }),
  });
}

function maybeEmitMissedTrace(input: {
  before: OverlayVisualShieldContentTransitionSnapshot | null;
  after: OverlayVisualShieldContentTransitionSnapshot;
  nextCardContentMounted: boolean;
  watch: KeyWatchState | null;
  overlayKey: string | null;
  expectedExitMarkersAllFalse: boolean;
  checkWasActiveBefore: boolean;
  previousSnapshotWasReset: boolean;
  moduleWasReinitialized: boolean;
}): void {
  if (input.nextCardContentMounted !== false) return;

  const parentReturnedBranch = readCheckOverlayParentReturnedBranch('queue-shell');
  const checkContextActive =
    input.before?.returnedBranch === 'check-overlay' ||
    input.checkWasActiveBefore ||
    parentReturnedBranch === 'check-overlay' ||
    checkWasActiveInSnapshot(input.after);
  if (!checkContextActive) return;
  if (!input.expectedExitMarkersAllFalse) return;

  const overlayKey =
    input.overlayKey ??
    resolveOverlayKey(input.after.checkBanId) ??
    resolveOverlayKey(input.before?.checkBanId ?? null);
  if (!overlayKey) return;

  const rootTraceAlreadyEmitted = rootEmittedKeys.has(overlayKey);
  if (rootTraceAlreadyEmitted) return;
  if (missedEmittedKeys.has(overlayKey)) return;
  missedEmittedKeys.add(overlayKey);

  const watch =
    input.watch ?? watchByKey.get(overlayKey) ?? null;
  const missedReason = resolveMissedReason({
    before: input.before,
    after: input.after,
    overlayKey,
    watch,
    expectedExitMarkersAllFalse: input.expectedExitMarkersAllFalse,
    checkWasActiveBefore: input.checkWasActiveBefore,
    rootTraceAlreadyEmitted,
    previousSnapshotWasReset: input.previousSnapshotWasReset,
    moduleWasReinitialized: input.moduleWasReinitialized,
  });

  console.error('OVERLAY_VISUAL_SHIELD_UNMOUNT_WATCH_MISSED_TRACE', {
    timestamp: diagTraceNow(),
    checkBanId: input.after.checkBanId ?? input.before?.checkBanId ?? null,
    checkOverlayKey: overlayKey,
    currentCardContentMounted: input.nextCardContentMounted,
    currentShellKind: input.after.shellKind,
    currentRenderBranch: input.after.renderBranch,
    currentReturnedBranch: input.after.returnedBranch,
    currentActiveNotificationChain: input.after.activeNotificationChain,
    currentNotificationOverlayVisible: input.after.notificationOverlayVisible,
    hasPreviousSnapshot: input.before != null,
    previousCardContentMounted: input.before?.cardContentMounted ?? null,
    previousCheckBanId: input.before?.checkBanId ?? null,
    previousCheckOverlayKey: resolveOverlayKey(input.before?.checkBanId ?? null),
    previousShellKind: input.before?.shellKind ?? null,
    previousRenderBranch: input.before?.renderBranch ?? null,
    previousReturnedBranch: input.before?.returnedBranch ?? null,
    watchArmed: watch?.armed ?? false,
    watchArmedForCheckOverlayKey: watch?.armed ? overlayKey : null,
    currentKeyMatchesArmedKey:
      watch?.armed === true && watch.armedParentMountId === input.after.parentMountId,
    rootTraceAlreadyEmitted,
    previousSnapshotWasReset: input.previousSnapshotWasReset,
    moduleWasReinitialized: input.moduleWasReinitialized,
    checkWasActiveBefore: input.checkWasActiveBefore,
    expectedExitMarkersAllFalse: input.expectedExitMarkersAllFalse,
    observerCallCountForCurrentKey: watch?.observerCallCount ?? 0,
    firstObservedValueForCurrentKey: watch?.firstObservedValue ?? null,
    lastObservedValueForCurrentKey: watch?.lastObservedValue ?? null,
    MISSED_REASON: missedReason,
  });
}

export function observeOverlayVisualShieldContentUnmountRoot(
  _input: OverlayVisualShieldContentUnmountRootInput,
): void {
  // Disabled in favor of CHECK_OVERLAY_VISUAL_SHIELD_BLOCK_ROOT_TRACE.
}
