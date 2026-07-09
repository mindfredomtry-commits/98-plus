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

export const CHECK_REMAINED_AFTER_RESULT_BUT_NOT_RENDERED_WATCH_MS = 400;

const DISPLAY_OR_RENDER_SAMPLE_SOURCES = [
  'display-commit-applied:',
  'syncDisplayFromQueue',
  'providers-return-branch:',
  'InstantBanFlow.',
  'watch-expired',
] as const;

export type CheckRemainedAfterResultButNotRenderedSnapshot = {
  currentOwnerQueueKinds: string[];
  currentOwnerQueueIds: string[];
  currentOverlayQueueRefKinds: string[];
  currentOverlayQueueRefIds: string[];
  currentOverlayQueueStateKinds: string[];
  currentOverlayQueueStateIds: string[];
  activeKind: string | null;
  activeBanId: string | null;
  ownerDisplayKind: string | null;
  ownerDisplayBanId: string | null;
  currentHeadKind: string | null;
  currentHeadId: string | null;
  notificationOverlayVisible: boolean | null;
  queueClaimsNotificationScreen: boolean | null;
  visualQueueDimSessionLive: boolean | null;
  activeNotificationChain: boolean | null;
  explicitDrainReason: string | null;
  drainSessionId: string | number | null;
  renderBranch: string | null;
  returnBranch: string | null;
  sendFlowOpening: boolean | null;
  lobbyVisible: boolean | null;
  lobbyMounted: boolean | null;
  shellKind: string | null;
  hasActiveOverlay: boolean | null;
};

export type CheckRemainedAfterResultButNotRenderedSample = Partial<
  CheckRemainedAfterResultButNotRenderedSnapshot
> & {
  source: string;
  reason?: string | null;
  calledFrom?: string | null;
};

export type CheckRemainedAfterResultButNotRenderedArmInput = {
  resultBanId: string;
  afterOwnerQueue: QueuedOverlay[];
  afterOverlayQueueRef?: QueuedOverlay[];
  afterOverlayQueueState?: QueuedOverlay[];
  source?: string;
  calledFrom?: string | null;
};

type CheckRemainedAfterResultButNotRenderedHooks = {
  readSnapshot: () => Partial<CheckRemainedAfterResultButNotRenderedSnapshot>;
};

type ActiveWatch = {
  armedAt: number;
  expiresAt: number;
  resultBanId: string;
  checkBanId: string;
  checkOverlayKey: string;
  afterResultQueueKinds: string[];
  afterResultQueueIds: string[];
  source: string;
  calledFrom: string | null;
  stack: string;
  emitted: boolean;
  sawCheckActivated: boolean;
  sawDisplayOrRenderSample: boolean;
  timerId: ReturnType<typeof setTimeout> | null;
};

let hooks: CheckRemainedAfterResultButNotRenderedHooks | null = null;
let activeWatch: ActiveWatch | null = null;

function queueKinds(queue: QueuedOverlay[]): string[] {
  return queue.map((item) => item.kind);
}

function queueIds(queue: QueuedOverlay[]): string[] {
  return queue
    .map((item) => queueHeadIdFrom(item))
    .filter((id): id is string => id != null);
}

function findRemainingCheck(queue: QueuedOverlay[]): QueuedOverlay | null {
  return queue.find((item) => item.kind === 'check') ?? null;
}

function captureStack(): string {
  try {
    return (
      new Error('CHECK_REMAINED_AFTER_RESULT_BUT_NOT_RENDERED_TRACE').stack ??
      ''
    );
  } catch {
    return '';
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

function mergeSnapshot(
  sample: CheckRemainedAfterResultButNotRenderedSample,
): CheckRemainedAfterResultButNotRenderedSnapshot {
  const enrichment = hooks?.readSnapshot() ?? {};
  return {
    currentOwnerQueueKinds:
      sample.currentOwnerQueueKinds ?? enrichment.currentOwnerQueueKinds ?? [],
    currentOwnerQueueIds:
      sample.currentOwnerQueueIds ?? enrichment.currentOwnerQueueIds ?? [],
    currentOverlayQueueRefKinds:
      sample.currentOverlayQueueRefKinds ??
      enrichment.currentOverlayQueueRefKinds ??
      [],
    currentOverlayQueueRefIds:
      sample.currentOverlayQueueRefIds ??
      enrichment.currentOverlayQueueRefIds ??
      [],
    currentOverlayQueueStateKinds:
      sample.currentOverlayQueueStateKinds ??
      enrichment.currentOverlayQueueStateKinds ??
      [],
    currentOverlayQueueStateIds:
      sample.currentOverlayQueueStateIds ??
      enrichment.currentOverlayQueueStateIds ??
      [],
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
    visualQueueDimSessionLive:
      sample.visualQueueDimSessionLive ??
      enrichment.visualQueueDimSessionLive ??
      null,
    activeNotificationChain:
      sample.activeNotificationChain ??
      enrichment.activeNotificationChain ??
      null,
    explicitDrainReason:
      sample.explicitDrainReason ?? enrichment.explicitDrainReason ?? null,
    drainSessionId: sample.drainSessionId ?? enrichment.drainSessionId ?? null,
    renderBranch: sample.renderBranch ?? enrichment.renderBranch ?? null,
    returnBranch: sample.returnBranch ?? enrichment.returnBranch ?? null,
    sendFlowOpening: sample.sendFlowOpening ?? enrichment.sendFlowOpening ?? null,
    lobbyVisible: sample.lobbyVisible ?? enrichment.lobbyVisible ?? null,
    lobbyMounted: sample.lobbyMounted ?? enrichment.lobbyMounted ?? null,
    shellKind: sample.shellKind ?? enrichment.shellKind ?? null,
    hasActiveOverlay:
      sample.hasActiveOverlay ?? enrichment.hasActiveOverlay ?? null,
  };
}

function checkStillPresent(
  snap: CheckRemainedAfterResultButNotRenderedSnapshot,
  checkBanId: string,
): boolean {
  const key = checkOverlayKey(checkBanId);
  const inKinds = (kinds: string[], ids: string[]) =>
    kinds.includes('check') ||
    ids.some((id) => id === checkBanId || id === key);

  return (
    inKinds(snap.currentOwnerQueueKinds, snap.currentOwnerQueueIds) ||
    inKinds(
      snap.currentOverlayQueueRefKinds,
      snap.currentOverlayQueueRefIds,
    ) ||
    inKinds(
      snap.currentOverlayQueueStateKinds,
      snap.currentOverlayQueueStateIds,
    )
  );
}

function isCheckActivated(
  snap: CheckRemainedAfterResultButNotRenderedSnapshot,
  checkBanId: string,
): boolean {
  const matchesBan =
    snap.activeBanId === checkBanId ||
    snap.ownerDisplayBanId === checkBanId ||
    snap.currentHeadId === checkBanId;
  return (
    (snap.activeKind === 'check' &&
      (matchesBan || snap.activeBanId == null)) ||
    (snap.ownerDisplayKind === 'check' &&
      (matchesBan || snap.ownerDisplayBanId == null)) ||
    (snap.currentHeadKind === 'check' &&
      (matchesBan || snap.currentHeadId == null))
  );
}

function isDisplayOrRenderSampleSource(source: string): boolean {
  return DISPLAY_OR_RENDER_SAMPLE_SOURCES.some((prefix) =>
    source.startsWith(prefix),
  );
}

function collectNotRenderedReasons(
  snap: CheckRemainedAfterResultButNotRenderedSnapshot,
  opts: { pastDisplayOrRenderCycle: boolean },
): string[] {
  const reasons: string[] = [];

  if (snap.renderBranch === 'lobby') {
    reasons.push('renderBranch===lobby');
  }
  if (snap.returnBranch === 'lobby') {
    reasons.push('returnBranch===lobby');
  }
  if (snap.shellKind == null && snap.renderBranch === 'no-shell-branch') {
    reasons.push('no-shell-branch');
  }

  // Kind/visibility mismatches need at least one display/render cycle.
  if (!opts.pastDisplayOrRenderCycle) return reasons;

  if (snap.hasActiveOverlay === false) {
    reasons.push('no-active-overlay');
  }
  if (
    snap.lobbyVisible === true &&
    snap.notificationOverlayVisible === false &&
    snap.activeKind !== 'check'
  ) {
    reasons.push('lobbyVisible-while-check-queued');
  }
  if (snap.activeKind !== 'check') {
    reasons.push(`activeKind!==check:${snap.activeKind ?? 'null'}`);
  }
  if (snap.ownerDisplayKind !== 'check') {
    reasons.push(
      `ownerDisplayKind!==check:${snap.ownerDisplayKind ?? 'null'}`,
    );
  }
  if (snap.currentHeadKind !== 'check') {
    reasons.push(
      `currentHeadKind!==check:${snap.currentHeadKind ?? 'null'}`,
    );
  }
  if (snap.notificationOverlayVisible === false) {
    reasons.push('notificationOverlayVisible===false');
  }
  if (snap.queueClaimsNotificationScreen === false) {
    reasons.push('queueClaimsNotificationScreen===false');
  }
  if (snap.activeNotificationChain === false) {
    reasons.push('activeNotificationChain===false');
  }
  return reasons;
}

function emitTrace(
  watch: ActiveWatch,
  sample: CheckRemainedAfterResultButNotRenderedSample,
  snap: CheckRemainedAfterResultButNotRenderedSnapshot,
  notRenderedReasons: string[],
): void {
  if (watch.emitted) return;
  watch.emitted = true;

  const now = diagTraceNow();
  const payload = {
    timestamp: now,
    checkBanId: watch.checkBanId,
    checkOverlayKey: watch.checkOverlayKey,
    source: sample.source || watch.source,
    reason:
      sample.reason ??
      (notRenderedReasons[0] ?? 'check-remained-but-not-rendered'),
    notRenderedReasons,
    calledFrom: sample.calledFrom ?? watch.calledFrom,
    stack: captureStack(),
    watchAgeMs: Math.round(now - watch.armedAt),
    afterResultQueueKinds: watch.afterResultQueueKinds,
    afterResultQueueIds: watch.afterResultQueueIds,
    currentOwnerQueueKinds: snap.currentOwnerQueueKinds,
    currentOwnerQueueIds: snap.currentOwnerQueueIds,
    currentOverlayQueueRefKinds: snap.currentOverlayQueueRefKinds,
    currentOverlayQueueRefIds: snap.currentOverlayQueueRefIds,
    currentOverlayQueueStateKinds: snap.currentOverlayQueueStateKinds,
    currentOverlayQueueStateIds: snap.currentOverlayQueueStateIds,
    activeKind: snap.activeKind,
    activeBanId: snap.activeBanId,
    ownerDisplayKind: snap.ownerDisplayKind,
    ownerDisplayBanId: snap.ownerDisplayBanId,
    currentHeadKind: snap.currentHeadKind,
    currentHeadId: snap.currentHeadId,
    notificationOverlayVisible: snap.notificationOverlayVisible,
    queueClaimsNotificationScreen: snap.queueClaimsNotificationScreen,
    visualQueueDimSessionLive: snap.visualQueueDimSessionLive,
    activeNotificationChain: snap.activeNotificationChain,
    explicitDrainReason: snap.explicitDrainReason,
    drainSessionId: snap.drainSessionId,
    renderBranch: snap.renderBranch,
    returnBranch: snap.returnBranch,
    sendFlowOpening: snap.sendFlowOpening,
    lobbyVisible: snap.lobbyVisible,
    lobbyMounted: snap.lobbyMounted,
    shellKind: snap.shellKind,
    hasActiveOverlay: snap.hasActiveOverlay,
    resultBanId: watch.resultBanId,
  };

  emitClientDiagTrace(
    'CHECK_REMAINED_AFTER_RESULT_BUT_NOT_RENDERED_TRACE',
    payload,
  );
  disarmWatch();
}

export function registerCheckRemainedAfterResultButNotRenderedHooks(
  next: CheckRemainedAfterResultButNotRenderedHooks | null,
): void {
  hooks = next;
}

export function armCheckRemainedAfterResultButNotRenderedWatch(
  input: CheckRemainedAfterResultButNotRenderedArmInput,
): void {
  if (!isClientDiagTraceEnvironment()) return;

  const afterKinds = queueKinds(input.afterOwnerQueue);
  const hasCheck =
    afterKinds[0] === 'check' || afterKinds.includes('check');
  if (!hasCheck) {
    disarmWatch();
    return;
  }

  const checkItem = findRemainingCheck(input.afterOwnerQueue);
  if (!checkItem || checkItem.kind !== 'check') {
    disarmWatch();
    return;
  }

  const checkBanId = queueHeadIdFrom(checkItem);
  if (!checkBanId) {
    disarmWatch();
    return;
  }

  clearWatchTimer(activeWatch);
  const armedAt = diagTraceNow();
  const watch: ActiveWatch = {
    armedAt,
    expiresAt: armedAt + CHECK_REMAINED_AFTER_RESULT_BUT_NOT_RENDERED_WATCH_MS,
    resultBanId: input.resultBanId,
    checkBanId,
    checkOverlayKey: overlayQueueKey(checkItem),
    afterResultQueueKinds: afterKinds,
    afterResultQueueIds: queueIds(input.afterOwnerQueue),
    source: input.source ?? 'finalizeResultForGoToBans:after-RESULT_GO_TO_BANS',
    calledFrom:
      input.calledFrom ?? 'ownerShadowDispatch:RESULT_GO_TO_BANS',
    stack: captureStack(),
    emitted: false,
    sawCheckActivated: false,
    sawDisplayOrRenderSample: false,
    timerId: null,
  };
  activeWatch = watch;
  watch.timerId = setTimeout(() => {
    if (activeWatch !== watch || watch.emitted) return;
    observeCheckRemainedAfterResultButNotRendered({
      source: 'watch-expired',
      reason: 'watch-expired-check-not-activated',
      calledFrom: 'check-remained-after-result-but-not-rendered-watch',
    });
    if (activeWatch === watch) {
      disarmWatch();
    }
  }, CHECK_REMAINED_AFTER_RESULT_BUT_NOT_RENDERED_WATCH_MS);
}

export function observeCheckRemainedAfterResultButNotRendered(
  sample: CheckRemainedAfterResultButNotRenderedSample,
): void {
  if (!isClientDiagTraceEnvironment()) return;
  const watch = activeWatch;
  if (!watch || watch.emitted) return;

  const now = diagTraceNow();
  if (now > watch.expiresAt + 50) {
    disarmWatch();
    return;
  }

  const snap = mergeSnapshot(sample);
  if (isDisplayOrRenderSampleSource(sample.source)) {
    watch.sawDisplayOrRenderSample = true;
  }
  if (isCheckActivated(snap, watch.checkBanId)) {
    watch.sawCheckActivated = true;
    disarmWatch();
    return;
  }

  if (!checkStillPresent(snap, watch.checkBanId)) {
    // Check removed by a later operation — not this trace's job.
    disarmWatch();
    return;
  }

  const notRenderedReasons = collectNotRenderedReasons(snap, {
    pastDisplayOrRenderCycle: watch.sawDisplayOrRenderSample,
  });
  if (sample.source === 'watch-expired' && !watch.sawCheckActivated) {
    notRenderedReasons.push('watch-expired-check-not-activated');
  }
  if (notRenderedReasons.length === 0) return;

  emitTrace(watch, sample, snap, notRenderedReasons);
}

export function buildOwnerQueueSnapshotFields(owner: {
  queue: QueuedOverlay[];
  active: { kind: string | null; banId: string | null };
  display: {
    result?: { id: string } | null;
    incomingBan?: { id: string } | null;
    checkBan?: { id: string } | null;
  };
}): Pick<
  CheckRemainedAfterResultButNotRenderedSnapshot,
  | 'currentOwnerQueueKinds'
  | 'currentOwnerQueueIds'
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
    currentOwnerQueueKinds: queueKinds(owner.queue),
    currentOwnerQueueIds: queueIds(owner.queue),
    activeKind: owner.active.kind,
    activeBanId: owner.active.banId,
    ownerDisplayKind: display.displayKind,
    ownerDisplayBanId: display.displayBanId,
    currentHeadKind: head?.kind ?? owner.active.kind,
    currentHeadId: head ? queueHeadIdFrom(head) : owner.active.banId,
  };
}

export function buildOverlayQueueSnapshotFields(input: {
  overlayQueueRef: QueuedOverlay[];
  overlayQueueState: QueuedOverlay[];
}): Pick<
  CheckRemainedAfterResultButNotRenderedSnapshot,
  | 'currentOverlayQueueRefKinds'
  | 'currentOverlayQueueRefIds'
  | 'currentOverlayQueueStateKinds'
  | 'currentOverlayQueueStateIds'
> {
  return {
    currentOverlayQueueRefKinds: queueKinds(input.overlayQueueRef),
    currentOverlayQueueRefIds: queueIds(input.overlayQueueRef),
    currentOverlayQueueStateKinds: queueKinds(input.overlayQueueState),
    currentOverlayQueueStateIds: queueIds(input.overlayQueueState),
  };
}
