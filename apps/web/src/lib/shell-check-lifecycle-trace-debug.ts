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

export const SHELL_CHECK_UNEXPECTED_EXIT_WATCH_MS = 1500;

export type ShellCheckActionMarkers = {
  userPressedCheckYes: boolean;
  userPressedCheckNo: boolean;
  submitCheckAnswerStarted: boolean;
  submitCheckAnswerFinished: boolean;
  checkDismissStarted: boolean;
  checkConsumed: boolean;
  resultArrivedAfterCheck: boolean;
};

export type ShellCheckLifecycleSnapshot = {
  shellKind: string | null;
  renderBranch: string | null;
  returnBranch: string | null;
  activeKind: string | null;
  activeBanId: string | null;
  ownerDisplayKind: string | null;
  ownerDisplayBanId: string | null;
  currentHeadKind: string | null;
  currentHeadId: string | null;
  notificationOverlayVisible: boolean | null;
  queueClaimsNotificationScreen: boolean | null;
  activeNotificationChain: boolean | null;
  visualQueueDimSessionLive: boolean | null;
  explicitDrainReason: string | null;
  drainSessionId: string | number | null;
  ownerQueueKinds: string[];
  ownerQueueIds: string[];
  ownerQueueKeys: string[];
  ownerPendingKinds: string[];
  ownerPendingIds: string[];
  ownerPendingKeys: string[];
  overlayQueueRefKinds: string[];
  overlayQueueRefIds: string[];
  overlayQueueRefKeys: string[];
  overlayQueueStateKinds: string[];
  overlayQueueStateIds: string[];
  overlayQueueStateKeys: string[];
  ownerQueueLen: number;
  ownerPendingLen: number;
  overlayQueueRefLen: number;
  overlayQueueStateLen: number;
  checkPresentInQueues: boolean;
};

export type ShellCheckLifecycleSample = Partial<ShellCheckLifecycleSnapshot> & {
  source: string;
  reason?: string | null;
  calledFrom?: string | null;
  event?: string | null;
};

type ShellCheckHooks = {
  readSnapshot: () => Partial<ShellCheckLifecycleSnapshot>;
};

type ActiveWatch = {
  armedAt: number;
  expiresAt: number;
  checkBanId: string;
  checkOverlayKey: string;
  activatedFromResultBanId: string | null;
  activatedFromResultOverlayKey: string | null;
  source: string;
  calledFrom: string | null;
  emittedUnexpectedExit: boolean;
  sawExpectedExit: boolean;
  timerId: ReturnType<typeof setTimeout> | null;
  markers: ShellCheckActionMarkers;
};

let hooks: ShellCheckHooks | null = null;
let activeWatch: ActiveWatch | null = null;
let lastLifecycleSig = '';
let lastLifecycleAt = 0;

let prevShellKind: string | null = null;
let prevRenderBranch: string | null = null;
let prevActiveKind: string | null = null;
let prevOwnerDisplayKind: string | null = null;
let prevCurrentHeadKind: string | null = null;
let prevCheckPresent: boolean | null = null;

const emptyMarkers = (): ShellCheckActionMarkers => ({
  userPressedCheckYes: false,
  userPressedCheckNo: false,
  submitCheckAnswerStarted: false,
  submitCheckAnswerFinished: false,
  checkDismissStarted: false,
  checkConsumed: false,
  resultArrivedAfterCheck: false,
});

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

function captureLifecycleStack(): string {
  try {
    return new Error('SHELL_CHECK_LIFECYCLE_TRACE').stack ?? '';
  } catch {
    return '';
  }
}

function captureUnexpectedExitStack(): string {
  try {
    return new Error('SHELL_CHECK_UNEXPECTED_EXIT_TRACE').stack ?? '';
  } catch {
    return '';
  }
}

function captureArmDecisionStack(): string {
  try {
    return new Error('SHELL_CHECK_LIFECYCLE_ARM_DECISION_TRACE').stack ?? '';
  } catch {
    return '';
  }
}

export type ShellCheckLifecycleArmDecisionReason =
  | 'armed'
  | 'not-check'
  | 'missing-check-id'
  | 'missing-check-key'
  | 'already-armed'
  | 'deduped'
  | 'success-trace-only-path'
  | 'hook-unavailable'
  | 'stale-success-snapshot'
  | 'active-kind-mismatch'
  | 'owner-display-mismatch'
  | 'head-kind-mismatch'
  | 'other';

export type ShellCheckLifecycleArmDecisionInput = {
  source: string;
  reason: string;
  calledFrom: string | null;
  expectedNextKind: string;
  expectedNextId: string | null;
  expectedNextKey: string;
  shellKind: string | null;
  renderBranch: string | null;
  activeKind: string | null;
  activeBanId: string | null;
  ownerDisplayKind: string | null;
  ownerDisplayBanId: string | null;
  currentHeadKind: string | null;
  currentHeadId: string | null;
  notificationOverlayVisible: boolean | null;
  queueClaimsNotificationScreen: boolean | null;
  activeNotificationChain: boolean | null;
  explicitDrainReason: string | null;
  drainSessionId: string | number | null;
  ownerQueueLen: number;
  ownerQueueKinds: string[];
  ownerQueueIds: string[];
  ownerQueueKeys: string[];
  overlayQueueRefLen: number;
  overlayQueueRefKinds: string[];
  overlayQueueRefIds: string[];
  overlayQueueRefKeys: string[];
  overlayQueueStateLen: number;
  overlayQueueStateKinds: string[];
  overlayQueueStateIds: string[];
  overlayQueueStateKeys: string[];
  activatedFromResultBanId?: string | null;
  activatedFromResultOverlayKey?: string | null;
  bridgeInvoked?: boolean;
};

function resolveActivatedIdentity(
  input: Pick<
    ShellCheckLifecycleArmDecisionInput,
    | 'expectedNextKind'
    | 'expectedNextId'
    | 'expectedNextKey'
    | 'shellKind'
    | 'activeKind'
    | 'activeBanId'
    | 'ownerDisplayKind'
    | 'ownerDisplayBanId'
    | 'currentHeadKind'
    | 'currentHeadId'
  >,
): {
  activatedKind: string | null;
  activatedId: string | null;
  activatedKey: string | null;
} {
  const kind = input.expectedNextKind;
  if (input.shellKind === kind) {
    return {
      activatedKind: input.shellKind,
      activatedId: input.expectedNextId ?? input.activeBanId,
      activatedKey: input.expectedNextKey,
    };
  }
  if (input.activeKind === kind) {
    return {
      activatedKind: input.activeKind,
      activatedId: input.activeBanId ?? input.expectedNextId,
      activatedKey: input.expectedNextKey,
    };
  }
  if (input.ownerDisplayKind === kind) {
    return {
      activatedKind: input.ownerDisplayKind,
      activatedId: input.ownerDisplayBanId ?? input.expectedNextId,
      activatedKey: input.expectedNextKey,
    };
  }
  if (input.currentHeadKind === kind) {
    return {
      activatedKind: input.currentHeadKind,
      activatedId: input.currentHeadId ?? input.expectedNextId,
      activatedKey: input.expectedNextKey,
    };
  }
  return {
    activatedKind: kind,
    activatedId: input.expectedNextId,
    activatedKey: input.expectedNextKey,
  };
}

function evaluateShellCheckLifecycleArmDecision(input: ShellCheckLifecycleArmDecisionInput): {
  armFunctionAvailable: boolean;
  armAttempted: boolean;
  armAllowed: boolean;
  armResult: string | null;
  armDecisionReason: ShellCheckLifecycleArmDecisionReason;
  newWatchCheckBanId: string | null;
  newWatchCheckOverlayKey: string | null;
} {
  const armFunctionAvailable = isClientDiagTraceEnvironment();
  const isCheck =
    input.expectedNextKind === 'check' ||
    input.renderBranch === 'shell-check' ||
    input.shellKind === 'check';
  const checkBanId = input.expectedNextId?.trim() ?? '';
  const derivedKey = checkBanId ? checkOverlayKey(checkBanId) : '';
  const checkOverlayKeyValue =
    input.expectedNextKey?.trim() || derivedKey || null;

  if (!armFunctionAvailable) {
    return {
      armFunctionAvailable: false,
      armAttempted: false,
      armAllowed: false,
      armResult: 'skipped',
      armDecisionReason: 'hook-unavailable',
      newWatchCheckBanId: checkBanId || null,
      newWatchCheckOverlayKey: checkOverlayKeyValue,
    };
  }

  if (input.bridgeInvoked === false) {
    return {
      armFunctionAvailable: true,
      armAttempted: false,
      armAllowed: false,
      armResult: 'skipped',
      armDecisionReason: 'success-trace-only-path',
      newWatchCheckBanId: checkBanId || null,
      newWatchCheckOverlayKey: checkOverlayKeyValue,
    };
  }

  if (!isCheck) {
    return {
      armFunctionAvailable: true,
      armAttempted: false,
      armAllowed: false,
      armResult: 'skipped',
      armDecisionReason: 'not-check',
      newWatchCheckBanId: null,
      newWatchCheckOverlayKey: null,
    };
  }

  if (!checkBanId) {
    return {
      armFunctionAvailable: true,
      armAttempted: true,
      armAllowed: false,
      armResult: 'skipped',
      armDecisionReason: 'missing-check-id',
      newWatchCheckBanId: null,
      newWatchCheckOverlayKey: checkOverlayKeyValue,
    };
  }

  if (!checkOverlayKeyValue) {
    return {
      armFunctionAvailable: true,
      armAttempted: true,
      armAllowed: false,
      armResult: 'skipped',
      armDecisionReason: 'missing-check-key',
      newWatchCheckBanId: checkBanId,
      newWatchCheckOverlayKey: null,
    };
  }

  if (input.activeKind != null && input.activeKind !== 'check') {
    return {
      armFunctionAvailable: true,
      armAttempted: true,
      armAllowed: false,
      armResult: 'skipped',
      armDecisionReason: 'active-kind-mismatch',
      newWatchCheckBanId: checkBanId,
      newWatchCheckOverlayKey: checkOverlayKeyValue,
    };
  }

  if (input.ownerDisplayKind != null && input.ownerDisplayKind !== 'check') {
    return {
      armFunctionAvailable: true,
      armAttempted: true,
      armAllowed: false,
      armResult: 'skipped',
      armDecisionReason: 'owner-display-mismatch',
      newWatchCheckBanId: checkBanId,
      newWatchCheckOverlayKey: checkOverlayKeyValue,
    };
  }

  if (input.currentHeadKind != null && input.currentHeadKind !== 'check') {
    return {
      armFunctionAvailable: true,
      armAttempted: true,
      armAllowed: false,
      armResult: 'skipped',
      armDecisionReason: 'head-kind-mismatch',
      newWatchCheckBanId: checkBanId,
      newWatchCheckOverlayKey: checkOverlayKeyValue,
    };
  }

  if (
    input.shellKind !== 'check' &&
    input.renderBranch !== 'shell-check' &&
    input.expectedNextKind === 'check'
  ) {
    return {
      armFunctionAvailable: true,
      armAttempted: true,
      armAllowed: false,
      armResult: 'skipped',
      armDecisionReason: 'stale-success-snapshot',
      newWatchCheckBanId: checkBanId,
      newWatchCheckOverlayKey: checkOverlayKeyValue,
    };
  }

  const existingWatch = activeWatch;
  if (
    existingWatch != null &&
    existingWatch.checkBanId === checkBanId &&
    existingWatch.checkOverlayKey === checkOverlayKeyValue
  ) {
    return {
      armFunctionAvailable: true,
      armAttempted: true,
      armAllowed: true,
      armResult: 'replaced',
      armDecisionReason: 'already-armed',
      newWatchCheckBanId: checkBanId,
      newWatchCheckOverlayKey: checkOverlayKeyValue,
    };
  }

  return {
    armFunctionAvailable: true,
    armAttempted: true,
    armAllowed: true,
    armResult: 'armed',
    armDecisionReason: 'armed',
    newWatchCheckBanId: checkBanId,
    newWatchCheckOverlayKey: checkOverlayKeyValue,
  };
}

export function traceShellCheckLifecycleArmDecisionOnSuccessHandoff(
  input: ShellCheckLifecycleArmDecisionInput,
): void {
  if (!isClientDiagTraceEnvironment()) return;

  const now = diagTraceNow();
  const existingWatch = activeWatch;
  const activated = resolveActivatedIdentity(input);
  const decision = evaluateShellCheckLifecycleArmDecision({
    ...input,
    bridgeInvoked: input.bridgeInvoked ?? true,
  });

  emitClientDiagTrace('SHELL_CHECK_LIFECYCLE_ARM_DECISION_TRACE', {
    timestamp: now,
    source: input.source,
    reason: input.reason,
    calledFrom: input.calledFrom,
    stack: captureArmDecisionStack(),
    expectedNextKind: input.expectedNextKind,
    expectedNextId: input.expectedNextId,
    expectedNextKey: input.expectedNextKey,
    activatedKind: activated.activatedKind,
    activatedId: activated.activatedId,
    activatedKey: activated.activatedKey,
    shellKind: input.shellKind,
    renderBranch: input.renderBranch,
    activeKind: input.activeKind,
    activeBanId: input.activeBanId,
    ownerDisplayKind: input.ownerDisplayKind,
    ownerDisplayBanId: input.ownerDisplayBanId,
    currentHeadKind: input.currentHeadKind,
    currentHeadId: input.currentHeadId,
    armFunctionAvailable: decision.armFunctionAvailable,
    armAttempted: decision.armAttempted,
    armAllowed: decision.armAllowed,
    armResult: decision.armResult,
    armDecisionReason: decision.armDecisionReason,
    existingWatchActive: existingWatch != null,
    existingWatchCheckBanId: existingWatch?.checkBanId ?? null,
    newWatchCheckBanId: decision.newWatchCheckBanId,
    newWatchCheckOverlayKey: decision.newWatchCheckOverlayKey,
    watchDurationMs: SHELL_CHECK_UNEXPECTED_EXIT_WATCH_MS,
    ownerQueueLen: input.ownerQueueLen,
    ownerQueueKinds: input.ownerQueueKinds,
    ownerQueueIds: input.ownerQueueIds,
    ownerQueueKeys: input.ownerQueueKeys,
    overlayQueueRefLen: input.overlayQueueRefLen,
    overlayQueueRefKinds: input.overlayQueueRefKinds,
    overlayQueueRefIds: input.overlayQueueRefIds,
    overlayQueueRefKeys: input.overlayQueueRefKeys,
    overlayQueueStateLen: input.overlayQueueStateLen,
    overlayQueueStateKinds: input.overlayQueueStateKinds,
    overlayQueueStateIds: input.overlayQueueStateIds,
    overlayQueueStateKeys: input.overlayQueueStateKeys,
    activeNotificationChain: input.activeNotificationChain,
    notificationOverlayVisible: input.notificationOverlayVisible,
    queueClaimsNotificationScreen: input.queueClaimsNotificationScreen,
    explicitDrainReason: input.explicitDrainReason,
    drainSessionId: input.drainSessionId,
  });

  noteShellCheckActivatedAfterResultRelease({
    expectedNextKind: input.expectedNextKind,
    expectedNextId: input.expectedNextId,
    expectedNextKey: input.expectedNextKey,
    renderBranch: input.renderBranch,
    shellKind: input.shellKind,
    activatedFromResultBanId: input.activatedFromResultBanId ?? null,
    activatedFromResultOverlayKey: input.activatedFromResultOverlayKey ?? null,
    source: input.source,
    calledFrom: input.calledFrom,
  });

  if (!decision.armAttempted) return;

  const watchAfter = activeWatch;
  const armed =
    watchAfter != null &&
    watchAfter.checkBanId === decision.newWatchCheckBanId &&
    watchAfter.checkOverlayKey === decision.newWatchCheckOverlayKey;

  if (armed) {
    emitClientDiagTrace('SHELL_CHECK_LIFECYCLE_ARMED_TRACE', {
      timestamp: diagTraceNow(),
      checkBanId: watchAfter.checkBanId,
      checkOverlayKey: watchAfter.checkOverlayKey,
      watchDurationMs: SHELL_CHECK_UNEXPECTED_EXIT_WATCH_MS,
      source: input.source,
      calledFrom: input.calledFrom,
    });
  }
}

function clearWatchTimer(watch: ActiveWatch | null): void {
  if (!watch?.timerId) return;
  clearTimeout(watch.timerId);
  watch.timerId = null;
}

function disarmWatch(): void {
  clearWatchTimer(activeWatch);
  activeWatch = null;
}

function checkPresentInQueues(
  checkBanId: string,
  snap: Pick<
    ShellCheckLifecycleSnapshot,
    | 'ownerQueueKinds'
    | 'ownerQueueIds'
    | 'ownerQueueKeys'
    | 'overlayQueueRefKinds'
    | 'overlayQueueRefIds'
    | 'overlayQueueRefKeys'
    | 'overlayQueueStateKinds'
    | 'overlayQueueStateIds'
    | 'overlayQueueStateKeys'
  >,
): boolean {
  const key = checkOverlayKey(checkBanId);
  const match = (kinds: string[], ids: string[], keys: string[]) =>
    kinds.includes('check') ||
    ids.includes(checkBanId) ||
    keys.includes(key);
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

function mergeSnapshot(
  sample: ShellCheckLifecycleSample,
): ShellCheckLifecycleSnapshot {
  const enrichment = hooks?.readSnapshot() ?? {};
  const merged: ShellCheckLifecycleSnapshot = {
    shellKind: sample.shellKind ?? enrichment.shellKind ?? null,
    renderBranch: sample.renderBranch ?? enrichment.renderBranch ?? null,
    returnBranch: sample.returnBranch ?? enrichment.returnBranch ?? null,
    activeKind: sample.activeKind ?? enrichment.activeKind ?? null,
    activeBanId: sample.activeBanId ?? enrichment.activeBanId ?? null,
    ownerDisplayKind:
      sample.ownerDisplayKind ?? enrichment.ownerDisplayKind ?? null,
    ownerDisplayBanId:
      sample.ownerDisplayBanId ?? enrichment.ownerDisplayBanId ?? null,
    currentHeadKind:
      sample.currentHeadKind ?? enrichment.currentHeadKind ?? null,
    currentHeadId: sample.currentHeadId ?? enrichment.currentHeadId ?? null,
    notificationOverlayVisible:
      sample.notificationOverlayVisible ??
      enrichment.notificationOverlayVisible ??
      null,
    queueClaimsNotificationScreen:
      sample.queueClaimsNotificationScreen ??
      enrichment.queueClaimsNotificationScreen ??
      null,
    activeNotificationChain:
      sample.activeNotificationChain ??
      enrichment.activeNotificationChain ??
      null,
    visualQueueDimSessionLive:
      sample.visualQueueDimSessionLive ??
      enrichment.visualQueueDimSessionLive ??
      null,
    explicitDrainReason:
      sample.explicitDrainReason ?? enrichment.explicitDrainReason ?? null,
    drainSessionId: sample.drainSessionId ?? enrichment.drainSessionId ?? null,
    ownerQueueKinds: sample.ownerQueueKinds ?? enrichment.ownerQueueKinds ?? [],
    ownerQueueIds: sample.ownerQueueIds ?? enrichment.ownerQueueIds ?? [],
    ownerQueueKeys: sample.ownerQueueKeys ?? enrichment.ownerQueueKeys ?? [],
    ownerPendingKinds:
      sample.ownerPendingKinds ?? enrichment.ownerPendingKinds ?? [],
    ownerPendingIds: sample.ownerPendingIds ?? enrichment.ownerPendingIds ?? [],
    ownerPendingKeys:
      sample.ownerPendingKeys ?? enrichment.ownerPendingKeys ?? [],
    overlayQueueRefKinds:
      sample.overlayQueueRefKinds ?? enrichment.overlayQueueRefKinds ?? [],
    overlayQueueRefIds:
      sample.overlayQueueRefIds ?? enrichment.overlayQueueRefIds ?? [],
    overlayQueueRefKeys:
      sample.overlayQueueRefKeys ?? enrichment.overlayQueueRefKeys ?? [],
    overlayQueueStateKinds:
      sample.overlayQueueStateKinds ?? enrichment.overlayQueueStateKinds ?? [],
    overlayQueueStateIds:
      sample.overlayQueueStateIds ?? enrichment.overlayQueueStateIds ?? [],
    overlayQueueStateKeys:
      sample.overlayQueueStateKeys ?? enrichment.overlayQueueStateKeys ?? [],
    ownerQueueLen:
      sample.ownerQueueLen ??
      enrichment.ownerQueueLen ??
      (sample.ownerQueueKinds ?? enrichment.ownerQueueKinds ?? []).length,
    ownerPendingLen:
      sample.ownerPendingLen ??
      enrichment.ownerPendingLen ??
      (sample.ownerPendingKinds ?? enrichment.ownerPendingKinds ?? []).length,
    overlayQueueRefLen:
      sample.overlayQueueRefLen ??
      enrichment.overlayQueueRefLen ??
      (sample.overlayQueueRefKinds ?? enrichment.overlayQueueRefKinds ?? [])
        .length,
    overlayQueueStateLen:
      sample.overlayQueueStateLen ??
      enrichment.overlayQueueStateLen ??
      (sample.overlayQueueStateKinds ?? enrichment.overlayQueueStateKinds ?? [])
        .length,
    checkPresentInQueues: false,
  };
  const watch = activeWatch;
  merged.checkPresentInQueues =
    sample.checkPresentInQueues ??
    enrichment.checkPresentInQueues ??
    (watch
      ? checkPresentInQueues(watch.checkBanId, merged)
      : merged.ownerQueueKinds.includes('check') ||
        merged.overlayQueueRefKinds.includes('check') ||
        merged.overlayQueueStateKinds.includes('check'));
  return merged;
}

function hasExpectedAction(markers: ShellCheckActionMarkers): boolean {
  return (
    markers.userPressedCheckYes ||
    markers.userPressedCheckNo ||
    markers.submitCheckAnswerStarted ||
    markers.submitCheckAnswerFinished ||
    markers.checkDismissStarted ||
    markers.checkConsumed ||
    markers.resultArrivedAfterCheck
  );
}

function collectUnexpectedExitReasons(
  snap: ShellCheckLifecycleSnapshot,
  checkBanId: string,
): string[] {
  const reasons: string[] = [];
  if (snap.renderBranch === 'lobby') reasons.push('renderBranch===lobby');
  if (snap.renderBranch === 'no-shell-branch') {
    reasons.push('renderBranch===no-shell-branch');
  }
  if (snap.returnBranch === 'lobby') reasons.push('returnBranch===lobby');
  if (snap.shellKind == null) reasons.push('shellKind===null');
  if (snap.shellKind != null && snap.shellKind !== 'check') {
    reasons.push(`shellKind!==check:${snap.shellKind}`);
  }
  if (snap.activeKind == null) reasons.push('activeKind===null');
  if (snap.activeKind != null && snap.activeKind !== 'check') {
    reasons.push(`activeKind!==check:${snap.activeKind}`);
  }
  if (snap.ownerDisplayKind == null) {
    reasons.push('ownerDisplayKind===null');
  }
  if (snap.ownerDisplayKind != null && snap.ownerDisplayKind !== 'check') {
    reasons.push(`ownerDisplayKind!==check:${snap.ownerDisplayKind}`);
  }
  if (snap.notificationOverlayVisible === false) {
    reasons.push('notificationOverlayVisible===false');
  }
  if (snap.queueClaimsNotificationScreen === false) {
    reasons.push('queueClaimsNotificationScreen===false');
  }
  if (!checkPresentInQueues(checkBanId, snap)) {
    reasons.push('check-missing-from-queues');
  }
  return reasons;
}

function buildCommonPayload(
  watch: ActiveWatch,
  sample: ShellCheckLifecycleSample,
  snap: ShellCheckLifecycleSnapshot,
  now: number,
) {
  return {
    timestamp: now,
    source: sample.source || watch.source,
    calledFrom: sample.calledFrom ?? watch.calledFrom,
    watchAgeMs: Math.round(now - watch.armedAt),
    checkBanId: watch.checkBanId,
    checkOverlayKey: watch.checkOverlayKey,
    activatedFromResultBanId: watch.activatedFromResultBanId,
    activatedFromResultOverlayKey: watch.activatedFromResultOverlayKey,
    shellKind: snap.shellKind,
    renderBranch: snap.renderBranch,
    returnBranch: snap.returnBranch,
    activeKind: snap.activeKind,
    activeBanId: snap.activeBanId,
    ownerDisplayKind: snap.ownerDisplayKind,
    ownerDisplayBanId: snap.ownerDisplayBanId,
    currentHeadKind: snap.currentHeadKind,
    currentHeadId: snap.currentHeadId,
    notificationOverlayVisible: snap.notificationOverlayVisible,
    queueClaimsNotificationScreen: snap.queueClaimsNotificationScreen,
    activeNotificationChain: snap.activeNotificationChain,
    visualQueueDimSessionLive: snap.visualQueueDimSessionLive,
    explicitDrainReason: snap.explicitDrainReason,
    drainSessionId: snap.drainSessionId,
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
    checkPresentInQueues: snap.checkPresentInQueues,
    ...watch.markers,
  };
}

function emitLifecycle(
  event: string,
  sample: ShellCheckLifecycleSample,
  snap: ShellCheckLifecycleSnapshot,
  extra?: Record<string, unknown>,
): void {
  const watch = activeWatch;
  const now = diagTraceNow();
  const payload = {
    timestamp: now,
    event,
    source: sample.source,
    reason: sample.reason ?? event,
    calledFrom: sample.calledFrom ?? sample.source,
    stack: captureLifecycleStack(),
    watchAgeMs: watch ? Math.round(now - watch.armedAt) : null,
    checkBanId: watch?.checkBanId ?? snap.ownerDisplayBanId ?? snap.activeBanId,
    checkOverlayKey: watch?.checkOverlayKey ?? null,
    activatedFromResultBanId: watch?.activatedFromResultBanId ?? null,
    activatedFromResultOverlayKey: watch?.activatedFromResultOverlayKey ?? null,
    shellKind: snap.shellKind,
    renderBranch: snap.renderBranch,
    returnBranch: snap.returnBranch,
    activeKind: snap.activeKind,
    activeBanId: snap.activeBanId,
    ownerDisplayKind: snap.ownerDisplayKind,
    ownerDisplayBanId: snap.ownerDisplayBanId,
    currentHeadKind: snap.currentHeadKind,
    currentHeadId: snap.currentHeadId,
    notificationOverlayVisible: snap.notificationOverlayVisible,
    queueClaimsNotificationScreen: snap.queueClaimsNotificationScreen,
    activeNotificationChain: snap.activeNotificationChain,
    visualQueueDimSessionLive: snap.visualQueueDimSessionLive,
    explicitDrainReason: snap.explicitDrainReason,
    drainSessionId: snap.drainSessionId,
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
    checkPresentInQueues: snap.checkPresentInQueues,
    ...(watch?.markers ?? emptyMarkers()),
    ...extra,
  };

  const sig = [
    event,
    payload.checkBanId,
    payload.renderBranch,
    payload.shellKind,
    payload.activeKind,
    payload.ownerDisplayKind,
    payload.currentHeadKind,
    payload.ownerQueueKinds.join(','),
  ].join('|');
  if (sig === lastLifecycleSig && now - lastLifecycleAt < 16) return;
  lastLifecycleSig = sig;
  lastLifecycleAt = now;

  emitClientDiagTrace('SHELL_CHECK_LIFECYCLE_TRACE', payload);
}

function emitUnexpectedExit(
  watch: ActiveWatch,
  sample: ShellCheckLifecycleSample,
  snap: ShellCheckLifecycleSnapshot,
  exitReasons: string[],
): void {
  if (watch.emittedUnexpectedExit || watch.sawExpectedExit) return;
  watch.emittedUnexpectedExit = true;
  const now = diagTraceNow();
  emitClientDiagTrace('SHELL_CHECK_UNEXPECTED_EXIT_TRACE', {
    ...buildCommonPayload(watch, sample, snap, now),
    reason:
      sample.reason ??
      (exitReasons[0] ?? 'shell-check-unexpected-exit'),
    exitReasons,
    stack: captureUnexpectedExitStack(),
  });
  disarmWatch();
}

export function registerShellCheckLifecycleTraceHooks(
  next: ShellCheckHooks | null,
): void {
  hooks = next;
}

export function armShellCheckUnexpectedExitWatch(input: {
  checkBanId: string;
  checkOverlayKey?: string | null;
  activatedFromResultBanId?: string | null;
  activatedFromResultOverlayKey?: string | null;
  source?: string;
  calledFrom?: string | null;
}): void {
  if (!isClientDiagTraceEnvironment()) return;
  const checkBanId = input.checkBanId?.trim();
  if (!checkBanId) return;

  clearWatchTimer(activeWatch);
  const armedAt = diagTraceNow();
  const watch: ActiveWatch = {
    armedAt,
    expiresAt: armedAt + SHELL_CHECK_UNEXPECTED_EXIT_WATCH_MS,
    checkBanId,
    checkOverlayKey: input.checkOverlayKey ?? checkOverlayKey(checkBanId),
    activatedFromResultBanId: input.activatedFromResultBanId ?? null,
    activatedFromResultOverlayKey: input.activatedFromResultOverlayKey ?? null,
    source: input.source ?? 'shell-check-activation',
    calledFrom: input.calledFrom ?? input.source ?? null,
    emittedUnexpectedExit: false,
    sawExpectedExit: false,
    timerId: null,
    markers: emptyMarkers(),
  };
  activeWatch = watch;
  watch.timerId = setTimeout(() => {
    if (
      activeWatch !== watch ||
      watch.emittedUnexpectedExit ||
      watch.sawExpectedExit
    ) {
      return;
    }
    // Quiet expiry without unexpected exit — check stayed alive.
    disarmWatch();
  }, SHELL_CHECK_UNEXPECTED_EXIT_WATCH_MS);
}

export function markShellCheckAction(
  marker: keyof ShellCheckActionMarkers,
  meta?: {
    source?: string;
    calledFrom?: string | null;
    checkBanId?: string | null;
    completed?: boolean | null;
  },
): void {
  if (!isClientDiagTraceEnvironment()) return;
  const watch = activeWatch;
  if (!watch) return;
  if (
    meta?.checkBanId &&
    normalizeLooseId(meta.checkBanId) !== normalizeLooseId(watch.checkBanId)
  ) {
    return;
  }
  watch.markers[marker] = true;
  if (hasExpectedAction(watch.markers)) {
    watch.sawExpectedExit = true;
  }
  emitLifecycle(
    `action:${marker}`,
    {
      source: meta?.source ?? 'shell-check-action',
      reason: marker,
      calledFrom: meta?.calledFrom ?? meta?.source ?? 'markShellCheckAction',
    },
    mergeSnapshot({
      source: meta?.source ?? 'shell-check-action',
    }),
    { completed: meta?.completed ?? null },
  );
}

function normalizeLooseId(id: string): string {
  return id.trim();
}

export function noteShellCheckActivatedAfterResultRelease(input: {
  expectedNextKind: string | null;
  expectedNextId: string | null;
  expectedNextKey?: string | null;
  renderBranch?: string | null;
  shellKind?: string | null;
  activatedFromResultBanId?: string | null;
  activatedFromResultOverlayKey?: string | null;
  source?: string;
  calledFrom?: string | null;
}): void {
  if (!isClientDiagTraceEnvironment()) return;
  const isCheck =
    input.expectedNextKind === 'check' ||
    input.renderBranch === 'shell-check' ||
    input.shellKind === 'check';
  if (!isCheck) return;
  const checkBanId = input.expectedNextId?.trim();
  if (!checkBanId) return;

  armShellCheckUnexpectedExitWatch({
    checkBanId,
    checkOverlayKey: input.expectedNextKey ?? checkOverlayKey(checkBanId),
    activatedFromResultBanId: input.activatedFromResultBanId ?? null,
    activatedFromResultOverlayKey: input.activatedFromResultOverlayKey ?? null,
    source: input.source ?? 'next-overlay-activation-success',
    calledFrom: input.calledFrom ?? 'NEXT_OVERLAY_ACTIVATION_SUCCESS',
  });

  emitLifecycle(
    'check-became-shell-after-result-handoff',
    {
      source: input.source ?? 'next-overlay-activation-success',
      reason: 'activated-check-after-result-release',
      calledFrom: input.calledFrom ?? 'noteShellCheckActivatedAfterResultRelease',
      shellKind: input.shellKind ?? 'check',
      renderBranch: input.renderBranch ?? 'shell-check',
      activeKind: 'check',
      ownerDisplayKind: 'check',
      currentHeadKind: 'check',
    },
    mergeSnapshot({
      source: input.source ?? 'next-overlay-activation-success',
      shellKind: input.shellKind ?? 'check',
      renderBranch: input.renderBranch ?? 'shell-check',
      activeKind: 'check',
      activeBanId: checkBanId,
      ownerDisplayKind: 'check',
      ownerDisplayBanId: checkBanId,
      currentHeadKind: 'check',
      currentHeadId: checkBanId,
    }),
  );
}

export function observeShellCheckLifecycle(
  sample: ShellCheckLifecycleSample,
): void {
  if (!isClientDiagTraceEnvironment()) return;

  const snap = mergeSnapshot(sample);
  const watch = activeWatch;
  const events: string[] = [];

  if (prevShellKind !== 'check' && snap.shellKind === 'check') {
    events.push('check-became-shell');
  }
  if (prevRenderBranch !== 'shell-check' && snap.renderBranch === 'shell-check') {
    events.push('check-render-branch');
  }
  if (
    prevRenderBranch === 'shell-check' &&
    snap.renderBranch != null &&
    snap.renderBranch !== 'shell-check'
  ) {
    events.push('branch-changed-away-from-shell-check');
  }
  if (prevActiveKind === 'check' && snap.activeKind !== 'check') {
    events.push('activeKind-changed-away-from-check');
  }
  if (
    prevOwnerDisplayKind === 'check' &&
    snap.ownerDisplayKind !== 'check'
  ) {
    events.push('ownerDisplayKind-changed-away-from-check');
  }
  if (prevCurrentHeadKind === 'check' && snap.currentHeadKind !== 'check') {
    events.push('queue-head-changed-away-from-check');
  }
  if (prevCheckPresent === true && snap.checkPresentInQueues === false) {
    events.push('check-removed-from-queues');
  }
  if (sample.event) {
    events.push(sample.event);
  }

  for (const event of events) {
    emitLifecycle(event, sample, snap, {
      prevShellKind,
      prevRenderBranch,
      prevActiveKind,
      prevOwnerDisplayKind,
      prevCurrentHeadKind,
      prevCheckPresent,
    });
  }

  prevShellKind = snap.shellKind;
  prevRenderBranch = snap.renderBranch;
  prevActiveKind = snap.activeKind;
  prevOwnerDisplayKind = snap.ownerDisplayKind;
  prevCurrentHeadKind = snap.currentHeadKind;
  prevCheckPresent = snap.checkPresentInQueues;

  if (!watch || watch.emittedUnexpectedExit) return;

  const now = diagTraceNow();
  if (now > watch.expiresAt + 50) {
    disarmWatch();
    return;
  }

  if (hasExpectedAction(watch.markers)) {
    watch.sawExpectedExit = true;
    emitLifecycle(
      'expected-exit-detected',
      {
        ...sample,
        reason: 'expected-user-or-consume-action',
      },
      snap,
    );
    disarmWatch();
    return;
  }

  const exitReasons = collectUnexpectedExitReasons(snap, watch.checkBanId);
  if (exitReasons.length === 0) return;

  // Only treat as unexpected exit after check was actually visible as shell-check
  // at least once, or immediately if queues already lost the check.
  const lostFromQueues = exitReasons.includes('check-missing-from-queues');
  const leftShell =
    exitReasons.some((r) => r.startsWith('renderBranch===')) ||
    exitReasons.some((r) => r.startsWith('shellKind')) ||
    exitReasons.some((r) => r.startsWith('activeKind')) ||
    exitReasons.some((r) => r.startsWith('ownerDisplayKind'));

  if (lostFromQueues || leftShell) {
    emitUnexpectedExit(watch, sample, snap, exitReasons);
  }
}

export function logShellCheckMountUnmount(input: {
  event: 'check-rendered' | 'check-unmounted' | 'check-branch-returned-null';
  source: string;
  calledFrom?: string | null;
  checkBanId?: string | null;
  visible?: boolean | null;
  returnBranch?: string | null;
  reason?: string | null;
}): void {
  if (!isClientDiagTraceEnvironment()) return;
  observeShellCheckLifecycle({
    source: input.source,
    calledFrom: input.calledFrom ?? input.source,
    event: input.event,
    reason: input.reason ?? input.event,
    activeKind: input.checkBanId ? 'check' : null,
    activeBanId: input.checkBanId ?? null,
    ownerDisplayKind: input.checkBanId ? 'check' : null,
    ownerDisplayBanId: input.checkBanId ?? null,
    returnBranch: input.returnBranch ?? null,
  });
}

export function buildShellCheckQueueSnapshotFields(input: {
  ownerQueue: QueuedOverlay[];
  ownerPending?: QueuedOverlay[];
  overlayQueueRef?: QueuedOverlay[];
  overlayQueueState?: QueuedOverlay[];
}): Pick<
  ShellCheckLifecycleSnapshot,
  | 'ownerQueueKinds'
  | 'ownerQueueIds'
  | 'ownerQueueKeys'
  | 'ownerPendingKinds'
  | 'ownerPendingIds'
  | 'ownerPendingKeys'
  | 'overlayQueueRefKinds'
  | 'overlayQueueRefIds'
  | 'overlayQueueRefKeys'
  | 'overlayQueueStateKinds'
  | 'overlayQueueStateIds'
  | 'overlayQueueStateKeys'
  | 'ownerQueueLen'
  | 'ownerPendingLen'
  | 'overlayQueueRefLen'
  | 'overlayQueueStateLen'
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

export function buildShellCheckOwnerDisplayFields(owner: {
  queue: QueuedOverlay[];
  pending?: QueuedOverlay[];
  active: { kind: string | null; banId: string | null };
  display: {
    result?: { id: string } | null;
    incomingBan?: { id: string } | null;
    checkBan?: { id: string } | null;
  };
}): Pick<
  ShellCheckLifecycleSnapshot,
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
