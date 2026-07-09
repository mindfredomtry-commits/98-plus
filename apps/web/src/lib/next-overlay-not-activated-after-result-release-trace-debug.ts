'use client';

import {
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
import { noteShellCheckActivatedAfterResultRelease } from '@/lib/shell-check-lifecycle-trace-debug';

export const NEXT_OVERLAY_AFTER_RESULT_RELEASE_WATCH_MS = 400;

const DISPLAY_OR_RENDER_SAMPLE_SOURCES = [
  'display-commit-applied:',
  'syncDisplayFromQueue',
  'providers-return-branch:',
  'Providers.render-branch',
  'InstantBanFlow.',
  'watch-expired',
] as const;

export type NextOverlayAfterResultReleaseSnapshot = {
  activeKind: string | null;
  activeBanId: string | null;
  ownerDisplayKind: string | null;
  ownerDisplayBanId: string | null;
  currentHeadKind: string | null;
  currentHeadId: string | null;
  shellKind: string | null;
  renderBranch: string | null;
  returnBranch: string | null;
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
  queueResultOverlayClaimed: boolean | null;
};

export type NextOverlayAfterResultReleaseSample = Partial<
  NextOverlayAfterResultReleaseSnapshot
> & {
  source: string;
  reason?: string | null;
  calledFrom?: string | null;
};

export type NextOverlayAfterResultReleaseArmInput = {
  source: string;
  calledFrom?: string | null;
  prevRenderBranch: string | null;
  nextRenderBranch: string | null;
  prevClaim: boolean | null;
  nextClaim: boolean | null;
  prevShellKind: string | null;
  nextShellKind: string | null;
  releasedResultBanId?: string | null;
  releasedResultOverlayKey?: string | null;
  ownerQueue: QueuedOverlay[];
  ownerPending?: QueuedOverlay[];
  overlayQueueRef?: QueuedOverlay[];
  overlayQueueState?: QueuedOverlay[];
  activeNotificationChain?: boolean | null;
  notificationOverlayVisible?: boolean | null;
  queueClaimsNotificationScreen?: boolean | null;
};

type NextOverlayHooks = {
  readSnapshot: () => Partial<NextOverlayAfterResultReleaseSnapshot>;
};

type ExpectedNext = {
  kind: string;
  id: string | null;
  key: string;
  source: 'owner.queue' | 'overlayQueueRef' | 'overlayQueueState';
};

type ActiveWatch = {
  armedAt: number;
  expiresAt: number;
  source: string;
  calledFrom: string | null;
  stack: string;
  prevRenderBranch: string | null;
  nextRenderBranch: string | null;
  prevClaim: boolean | null;
  nextClaim: boolean | null;
  prevShellKind: string | null;
  nextShellKind: string | null;
  releasedResultBanId: string | null;
  releasedResultOverlayKey: string | null;
  expectedNext: ExpectedNext;
  emittedFail: boolean;
  emittedSuccess: boolean;
  sawDisplayOrRenderSample: boolean;
  timerId: ReturnType<typeof setTimeout> | null;
};

let hooks: NextOverlayHooks | null = null;
let activeWatch: ActiveWatch | null = null;
let prevRenderBranchTrack: string | null = null;
let prevClaimTrack: boolean | null = null;
let prevShellKindTrack: string | null = null;

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

function captureFailStack(): string {
  try {
    return (
      new Error('NEXT_OVERLAY_NOT_ACTIVATED_AFTER_RESULT_RELEASE_TRACE')
        .stack ?? ''
    );
  } catch {
    return '';
  }
}

function captureSuccessStack(): string {
  try {
    return (
      new Error('NEXT_OVERLAY_ACTIVATION_SUCCESS_AFTER_RESULT_RELEASE_TRACE')
        .stack ?? ''
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

function isOverlayKind(kind: string | null | undefined): boolean {
  return kind === 'check' || kind === 'incoming' || kind === 'result';
}

function pickExpectedNext(input: {
  ownerQueue: QueuedOverlay[];
  overlayQueueRef?: QueuedOverlay[];
  overlayQueueState?: QueuedOverlay[];
}): ExpectedNext | null {
  const candidates: Array<{
    queue: QueuedOverlay[];
    source: ExpectedNext['source'];
  }> = [
    { queue: input.ownerQueue, source: 'owner.queue' },
    {
      queue: input.overlayQueueRef ?? [],
      source: 'overlayQueueRef',
    },
    {
      queue: input.overlayQueueState ?? [],
      source: 'overlayQueueState',
    },
  ];

  for (const candidate of candidates) {
    if (candidate.queue.length === 0) continue;
    // Prefer first non-result head if present; otherwise first overlay kind.
    const preferred =
      candidate.queue.find((item) => item.kind !== 'result') ??
      candidate.queue[0] ??
      null;
    if (!preferred || !isOverlayKind(preferred.kind)) continue;
    return {
      kind: preferred.kind,
      id: queueHeadIdFrom(preferred),
      key: overlayQueueKey(preferred),
      source: candidate.source,
    };
  }
  return null;
}

function shouldArmFromTransition(input: {
  prevRenderBranch: string | null;
  nextRenderBranch: string | null;
  prevClaim: boolean | null;
  nextClaim: boolean | null;
}): boolean {
  const renderRelease =
    input.prevRenderBranch === 'shell-result' &&
    input.nextRenderBranch === 'no-shell-branch';
  const claimRelease =
    input.prevClaim === true && input.nextClaim === false;
  return renderRelease || claimRelease;
}

function mergeSnapshot(
  sample: NextOverlayAfterResultReleaseSample,
): NextOverlayAfterResultReleaseSnapshot {
  const enrichment = hooks?.readSnapshot() ?? {};
  return {
    activeKind: sample.activeKind ?? enrichment.activeKind ?? null,
    activeBanId: sample.activeBanId ?? enrichment.activeBanId ?? null,
    ownerDisplayKind:
      sample.ownerDisplayKind ?? enrichment.ownerDisplayKind ?? null,
    ownerDisplayBanId:
      sample.ownerDisplayBanId ?? enrichment.ownerDisplayBanId ?? null,
    currentHeadKind:
      sample.currentHeadKind ?? enrichment.currentHeadKind ?? null,
    currentHeadId: sample.currentHeadId ?? enrichment.currentHeadId ?? null,
    shellKind: sample.shellKind ?? enrichment.shellKind ?? null,
    renderBranch: sample.renderBranch ?? enrichment.renderBranch ?? null,
    returnBranch: sample.returnBranch ?? enrichment.returnBranch ?? null,
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
    ownerPendingIds:
      sample.ownerPendingIds ?? enrichment.ownerPendingIds ?? [],
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
    queueResultOverlayClaimed:
      sample.queueResultOverlayClaimed ??
      enrichment.queueResultOverlayClaimed ??
      null,
  };
}

function expectedStillPresent(
  snap: NextOverlayAfterResultReleaseSnapshot,
  expected: ExpectedNext,
): boolean {
  const match = (kinds: string[], ids: string[], keys: string[]) =>
    kinds.includes(expected.kind) ||
    (expected.id != null && ids.includes(expected.id)) ||
    keys.includes(expected.key);

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

function isNextActivated(
  snap: NextOverlayAfterResultReleaseSnapshot,
  expected: ExpectedNext,
): boolean {
  const kindMatches = (kind: string | null) => kind === expected.kind;
  const idMatches = (id: string | null) =>
    expected.id == null || id == null || id === expected.id;
  const activatedByKind =
    (kindMatches(snap.activeKind) && idMatches(snap.activeBanId)) ||
    (kindMatches(snap.ownerDisplayKind) &&
      idMatches(snap.ownerDisplayBanId)) ||
    (kindMatches(snap.currentHeadKind) && idMatches(snap.currentHeadId)) ||
    kindMatches(snap.shellKind);

  if (!activatedByKind) return false;

  const branch = snap.renderBranch;
  if (branch === 'no-shell-branch' || branch === 'lobby') return false;
  if (snap.returnBranch === 'lobby') return false;
  return true;
}

function collectNotActivatedReasons(
  snap: NextOverlayAfterResultReleaseSnapshot,
  expected: ExpectedNext,
  opts: { pastDisplayOrRenderCycle: boolean },
): string[] {
  // Wait for at least one post-release display/render sample before failing.
  if (!opts.pastDisplayOrRenderCycle) return [];

  const reasons: string[] = [];

  if (snap.renderBranch === 'no-shell-branch') {
    reasons.push('renderBranch===no-shell-branch');
  }
  if (snap.renderBranch === 'lobby') {
    reasons.push('renderBranch===lobby');
  }
  if (snap.returnBranch === 'lobby') {
    reasons.push('returnBranch===lobby');
  }
  if (snap.shellKind == null) {
    reasons.push('shellKind===null');
  }
  if (snap.activeKind == null || snap.activeKind !== expected.kind) {
    reasons.push(`activeKind!==${expected.kind}:${snap.activeKind ?? 'null'}`);
  }
  if (
    snap.ownerDisplayKind == null ||
    snap.ownerDisplayKind !== expected.kind
  ) {
    reasons.push(
      `ownerDisplayKind!==${expected.kind}:${snap.ownerDisplayKind ?? 'null'}`,
    );
  }
  if (
    snap.currentHeadKind == null ||
    snap.currentHeadKind !== expected.kind
  ) {
    reasons.push(
      `currentHeadKind!==${expected.kind}:${snap.currentHeadKind ?? 'null'}`,
    );
  }
  if (snap.notificationOverlayVisible === false) {
    reasons.push('notificationOverlayVisible===false');
  }
  if (snap.queueClaimsNotificationScreen === false) {
    reasons.push('queueClaimsNotificationScreen===false');
  }
  return reasons;
}

function isDisplayOrRenderSampleSource(source: string): boolean {
  return DISPLAY_OR_RENDER_SAMPLE_SOURCES.some((prefix) =>
    source.startsWith(prefix),
  );
}

function buildCommonPayload(
  watch: ActiveWatch,
  sample: NextOverlayAfterResultReleaseSample,
  snap: NextOverlayAfterResultReleaseSnapshot,
  now: number,
) {
  return {
    timestamp: now,
    source: sample.source || watch.source,
    calledFrom: sample.calledFrom ?? watch.calledFrom,
    watchAgeMs: Math.round(now - watch.armedAt),
    prevRenderBranch: watch.prevRenderBranch,
    nextRenderBranch: watch.nextRenderBranch,
    prevClaim: watch.prevClaim,
    nextClaim: watch.nextClaim,
    prevShellKind: watch.prevShellKind,
    nextShellKind: watch.nextShellKind,
    releasedResultBanId: watch.releasedResultBanId,
    releasedResultOverlayKey: watch.releasedResultOverlayKey,
    expectedNextKind: watch.expectedNext.kind,
    expectedNextId: watch.expectedNext.id,
    expectedNextKey: watch.expectedNext.key,
    expectedNextSource: watch.expectedNext.source,
    activeKind: snap.activeKind,
    activeBanId: snap.activeBanId,
    ownerDisplayKind: snap.ownerDisplayKind,
    ownerDisplayBanId: snap.ownerDisplayBanId,
    currentHeadKind: snap.currentHeadKind,
    currentHeadId: snap.currentHeadId,
    shellKind: snap.shellKind,
    renderBranch: snap.renderBranch,
    returnBranch: snap.returnBranch,
    notificationOverlayVisible: snap.notificationOverlayVisible,
    queueClaimsNotificationScreen: snap.queueClaimsNotificationScreen,
    activeNotificationChain: snap.activeNotificationChain,
    visualQueueDimSessionLive: snap.visualQueueDimSessionLive,
    explicitDrainReason: snap.explicitDrainReason,
    drainSessionId: snap.drainSessionId,
    queueResultOverlayClaimed: snap.queueResultOverlayClaimed,
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
  };
}

function emitFail(
  watch: ActiveWatch,
  sample: NextOverlayAfterResultReleaseSample,
  snap: NextOverlayAfterResultReleaseSnapshot,
  notActivatedReasons: string[],
): void {
  if (watch.emittedFail || watch.emittedSuccess) return;
  watch.emittedFail = true;
  const now = diagTraceNow();
  emitClientDiagTrace('NEXT_OVERLAY_NOT_ACTIVATED_AFTER_RESULT_RELEASE_TRACE', {
    ...buildCommonPayload(watch, sample, snap, now),
    reason:
      sample.reason ??
      (notActivatedReasons[0] ?? 'next-overlay-not-activated-after-result-release'),
    notActivatedReasons,
    stack: captureFailStack(),
  });
  disarmWatch();
}

function emitSuccess(
  watch: ActiveWatch,
  sample: NextOverlayAfterResultReleaseSample,
  snap: NextOverlayAfterResultReleaseSnapshot,
): void {
  if (watch.emittedFail || watch.emittedSuccess) return;
  watch.emittedSuccess = true;
  const now = diagTraceNow();
  const successPayload = {
    ...buildCommonPayload(watch, sample, snap, now),
    reason: sample.reason ?? 'next-overlay-activated-after-result-release',
    stack: captureSuccessStack(),
  };
  emitClientDiagTrace(
    'NEXT_OVERLAY_ACTIVATION_SUCCESS_AFTER_RESULT_RELEASE_TRACE',
    successPayload,
  );
  noteShellCheckActivatedAfterResultRelease({
    expectedNextKind: watch.expectedNext.kind,
    expectedNextId: watch.expectedNext.id,
    expectedNextKey: watch.expectedNext.key,
    renderBranch: snap.renderBranch,
    shellKind: snap.shellKind,
    activatedFromResultBanId: watch.releasedResultBanId,
    activatedFromResultOverlayKey: watch.releasedResultOverlayKey,
    source: sample.source || watch.source,
    calledFrom: sample.calledFrom ?? watch.calledFrom,
  });
  disarmWatch();
}

export function registerNextOverlayAfterResultReleaseHooks(
  next: NextOverlayHooks | null,
): void {
  hooks = next;
}

export function armNextOverlayNotActivatedAfterResultReleaseWatch(
  input: NextOverlayAfterResultReleaseArmInput,
): void {
  if (!isClientDiagTraceEnvironment()) return;

  if (
    !shouldArmFromTransition({
      prevRenderBranch: input.prevRenderBranch,
      nextRenderBranch: input.nextRenderBranch,
      prevClaim: input.prevClaim,
      nextClaim: input.nextClaim,
    })
  ) {
    return;
  }

  if (input.activeNotificationChain !== true) return;
  if (input.notificationOverlayVisible !== true) return;
  if (input.queueClaimsNotificationScreen !== true) return;

  const expectedNext = pickExpectedNext({
    ownerQueue: input.ownerQueue,
    overlayQueueRef: input.overlayQueueRef,
    overlayQueueState: input.overlayQueueState,
  });
  if (!expectedNext) return;

  clearWatchTimer(activeWatch);
  const armedAt = diagTraceNow();
  const watch: ActiveWatch = {
    armedAt,
    expiresAt: armedAt + NEXT_OVERLAY_AFTER_RESULT_RELEASE_WATCH_MS,
    source: input.source,
    calledFrom: input.calledFrom ?? input.source,
    stack: captureFailStack(),
    prevRenderBranch: input.prevRenderBranch,
    nextRenderBranch: input.nextRenderBranch,
    prevClaim: input.prevClaim,
    nextClaim: input.nextClaim,
    prevShellKind: input.prevShellKind,
    nextShellKind: input.nextShellKind,
    releasedResultBanId: input.releasedResultBanId ?? null,
    releasedResultOverlayKey: input.releasedResultOverlayKey ?? null,
    expectedNext,
    emittedFail: false,
    emittedSuccess: false,
    sawDisplayOrRenderSample: false,
    timerId: null,
  };
  activeWatch = watch;
  watch.timerId = setTimeout(() => {
    if (activeWatch !== watch || watch.emittedFail || watch.emittedSuccess) {
      return;
    }
    observeNextOverlayAfterResultRelease({
      source: 'watch-expired',
      reason: 'watch-expired-next-overlay-not-activated',
      calledFrom: 'next-overlay-after-result-release-watch',
    });
    if (activeWatch === watch) {
      disarmWatch();
    }
  }, NEXT_OVERLAY_AFTER_RESULT_RELEASE_WATCH_MS);
}

export function observeNextOverlayAfterResultRelease(
  sample: NextOverlayAfterResultReleaseSample,
): void {
  if (!isClientDiagTraceEnvironment()) return;
  const watch = activeWatch;
  if (!watch || watch.emittedFail || watch.emittedSuccess) return;

  const now = diagTraceNow();
  if (now > watch.expiresAt + 50) {
    disarmWatch();
    return;
  }

  if (isDisplayOrRenderSampleSource(sample.source)) {
    watch.sawDisplayOrRenderSample = true;
  }

  const snap = mergeSnapshot(sample);

  if (isNextActivated(snap, watch.expectedNext)) {
    emitSuccess(watch, sample, snap);
    return;
  }

  if (!expectedStillPresent(snap, watch.expectedNext)) {
    // Expected next disappeared — different failure mode; stop this watch.
    disarmWatch();
    return;
  }

  const notActivatedReasons = collectNotActivatedReasons(
    snap,
    watch.expectedNext,
    { pastDisplayOrRenderCycle: watch.sawDisplayOrRenderSample },
  );
  if (sample.source === 'watch-expired') {
    notActivatedReasons.push('watch-expired-next-overlay-not-activated');
  }
  if (notActivatedReasons.length === 0) return;

  emitFail(watch, sample, snap, notActivatedReasons);
}

/**
 * Observe derived shell/claim transitions and arm the short-lived watch when
 * result shell/claim releases while a next overlay remains queued.
 */
export function observeResultShellReleaseForNextOverlayActivation(input: {
  source: string;
  calledFrom?: string | null;
  renderBranch: string | null;
  shellKind: string | null;
  queueResultOverlayClaimed: boolean;
  ownerQueue: QueuedOverlay[];
  ownerPending?: QueuedOverlay[];
  overlayQueueRef?: QueuedOverlay[];
  overlayQueueState?: QueuedOverlay[];
  activeNotificationChain?: boolean | null;
  notificationOverlayVisible?: boolean | null;
  queueClaimsNotificationScreen?: boolean | null;
  releasedResultBanId?: string | null;
  releasedResultOverlayKey?: string | null;
  sample?: NextOverlayAfterResultReleaseSample;
}): void {
  if (!isClientDiagTraceEnvironment()) return;

  const prevRenderBranch = prevRenderBranchTrack;
  const prevClaim = prevClaimTrack;
  const prevShellKind = prevShellKindTrack;
  const nextRenderBranch = input.renderBranch;
  const nextClaim = input.queueResultOverlayClaimed;
  const nextShellKind = input.shellKind;

  if (
    shouldArmFromTransition({
      prevRenderBranch,
      nextRenderBranch,
      prevClaim,
      nextClaim,
    })
  ) {
    armNextOverlayNotActivatedAfterResultReleaseWatch({
      source: input.source,
      calledFrom: input.calledFrom,
      prevRenderBranch,
      nextRenderBranch,
      prevClaim,
      nextClaim,
      prevShellKind,
      nextShellKind,
      releasedResultBanId: input.releasedResultBanId ?? null,
      releasedResultOverlayKey: input.releasedResultOverlayKey ?? null,
      ownerQueue: input.ownerQueue,
      ownerPending: input.ownerPending,
      overlayQueueRef: input.overlayQueueRef,
      overlayQueueState: input.overlayQueueState,
      activeNotificationChain: input.activeNotificationChain,
      notificationOverlayVisible: input.notificationOverlayVisible,
      queueClaimsNotificationScreen: input.queueClaimsNotificationScreen,
    });
  }

  prevRenderBranchTrack = nextRenderBranch;
  prevClaimTrack = nextClaim;
  prevShellKindTrack = nextShellKind;

  if (input.sample) {
    observeNextOverlayAfterResultRelease(input.sample);
  } else {
    observeNextOverlayAfterResultRelease({
      source: input.source,
      reason: 'result-shell-release-observe',
      calledFrom: input.calledFrom,
      renderBranch: nextRenderBranch,
      shellKind: nextShellKind,
      queueResultOverlayClaimed: nextClaim,
    });
  }
}

export function buildNextOverlayQueueSnapshotFields(input: {
  ownerQueue: QueuedOverlay[];
  ownerPending?: QueuedOverlay[];
  overlayQueueRef?: QueuedOverlay[];
  overlayQueueState?: QueuedOverlay[];
}): Pick<
  NextOverlayAfterResultReleaseSnapshot,
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

export function buildNextOverlayOwnerDisplayFields(owner: {
  queue: QueuedOverlay[];
  pending?: QueuedOverlay[];
  active: { kind: string | null; banId: string | null };
  display: {
    result?: { id: string } | null;
    incomingBan?: { id: string } | null;
    checkBan?: { id: string } | null;
  };
}): Pick<
  NextOverlayAfterResultReleaseSnapshot,
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
