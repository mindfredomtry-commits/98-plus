/**
 * DIAGNOSTICS ONLY — OVERBOARD_FLASH_ORIGIN_V1
 *
 * Fired once per visually renderable overboard mount (final ResultOverlay /
 * DirectOverboard portal boundary). Proves which writer painted the flash and
 * whether SUCCESS handoff resolveSuccessDrainBatch ran / withheld the item.
 * No product behavior changes.
 */
import type { BanResult } from '@98plus/shared';
import type { QueuedOverlay } from '@/lib/overlay-queue';
import { resolveBanResultOutcome } from '@/lib/overkill-terminal-lock';
import { PHASE12_BUILD_MARKER } from '@/lib/phase12-build-marker';
import type { SuccessHandoffMaterializeStage } from '@/lib/success-handoff-result-preemption';

export const OVERBOARD_FLASH_ORIGIN_V1 = 'OVERBOARD_FLASH_ORIGIN_V1' as const;
export const OVERBOARD_FLASH_ORIGIN_EXPECTED_COMMIT = 'a102396' as const;

export type OverboardFlashOriginWriter =
  | 'SUCCESS_LOCAL_BATCH'
  | 'SUCCESS_TRANSPORT_BATCH'
  | 'SUCCESS_RUNTIME_FALLBACK'
  | 'OPEN_BAN_RESULT'
  | 'RECEIVE_RESULT'
  | 'LATE_RESULT_ARRIVED'
  | 'APPLY_DISPLAY'
  | 'SYNC_DISPLAY_FROM_QUEUE'
  | 'DIRECT_OVERBOARD_FORCED_BY_QUEUE'
  | 'UNKNOWN';

export type OverboardFlashQueueItemSnap = {
  id: string;
  kind: string;
  outcome: string | null;
};

export type OverboardFlashOriginSnapshot = {
  successCardMounted: boolean;
  successExitDraining: boolean;
  runtimeLifecycle: string | null;
  runtimeAction: string | null;
  runtimeQueue: OverboardFlashQueueItemSnap[];
  runtimeDisplayKind: string | null;
  runtimeDisplayId: string | null;
  runtimeDisplayOutcome: string | null;
  ownerQueue: OverboardFlashQueueItemSnap[];
  effectiveNotificationQueueShellKind: string | null;
  queueResultOverlayClaimed: boolean;
  directOverboardRenderForcedByQueueResult: boolean;
  directOverboardVisible: boolean;
  resultOverlayVisible: boolean;
  openBanResultActiveId: string | null;
  receiveResultActiveId: string | null;
  lateResultActiveId: string | null;
};

type SuccessDrainLedger = {
  ran: boolean;
  stage: SuccessHandoffMaterializeStage | null;
  withheldIds: string[];
  materializedIds: string[];
  atMs: number;
};

type WriterStamp = {
  writer: OverboardFlashOriginWriter;
  banId: string;
  atMs: number;
};

let snapshotReader: (() => OverboardFlashOriginSnapshot) | null = null;
let lastSuccessDrain: SuccessDrainLedger = {
  ran: false,
  stage: null,
  withheldIds: [],
  materializedIds: [],
  atMs: 0,
};
let lastWriter: WriterStamp | null = null;
let openBanResultActiveId: string | null = null;
let receiveResultActiveId: string | null = null;
let lateResultActiveId: string | null = null;
const emittedMountKeys = new Set<string>();

function nowMs(): number {
  return typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now();
}

export function overboardFlashOriginBuildCommit(): string {
  return (
    PHASE12_BUILD_MARKER.buildCommit ||
    process.env.NEXT_PUBLIC_BUILD_COMMIT ||
    process.env.NEXT_PUBLIC_RAILWAY_GIT_COMMIT_SHA ||
    ''
  );
}

export function registerOverboardFlashOriginSnapshotReader(
  reader: (() => OverboardFlashOriginSnapshot) | null,
): void {
  snapshotReader = reader;
}

export function noteSuccessDrainBatchForFlashOrigin(args: {
  stage: SuccessHandoffMaterializeStage;
  withheld: readonly QueuedOverlay[];
  materialize: readonly QueuedOverlay[];
}): void {
  lastSuccessDrain = {
    ran: true,
    stage: args.stage,
    withheldIds: args.withheld.map((item) =>
      item.kind === 'result' ? item.result.id : '',
    ).filter(Boolean),
    materializedIds: args.materialize.map((item) =>
      item.kind === 'result'
        ? item.result.id
        : item.ban.id,
    ),
    atMs: nowMs(),
  };
}

export function noteOverboardFlashWriter(
  writer: OverboardFlashOriginWriter,
  banId: string | null | undefined,
): void {
  const id = (banId ?? '').trim();
  if (!id) return;
  lastWriter = { writer, banId: id, atMs: nowMs() };
  if (writer === 'OPEN_BAN_RESULT') openBanResultActiveId = id;
  if (writer === 'RECEIVE_RESULT') receiveResultActiveId = id;
  if (writer === 'LATE_RESULT_ARRIVED') lateResultActiveId = id;
}

export function clearOverboardFlashWriterActive(
  writer: 'OPEN_BAN_RESULT' | 'RECEIVE_RESULT' | 'LATE_RESULT_ARRIVED',
  banId?: string | null,
): void {
  const id = (banId ?? '').trim();
  if (writer === 'OPEN_BAN_RESULT') {
    if (!id || openBanResultActiveId === id) openBanResultActiveId = null;
  }
  if (writer === 'RECEIVE_RESULT') {
    if (!id || receiveResultActiveId === id) receiveResultActiveId = null;
  }
  if (writer === 'LATE_RESULT_ARRIVED') {
    if (!id || lateResultActiveId === id) lateResultActiveId = null;
  }
}

function queueItemSnap(item: QueuedOverlay): OverboardFlashQueueItemSnap {
  if (item.kind === 'result') {
    return {
      id: item.result.id,
      kind: 'result',
      outcome: resolveBanResultOutcome(item.result) || null,
    };
  }
  return { id: item.ban.id, kind: item.kind, outcome: null };
}

export function snapQueuedOverlays(
  items: readonly QueuedOverlay[],
): OverboardFlashQueueItemSnap[] {
  return items.map(queueItemSnap);
}

function attributionFor(
  banId: string,
  forcedByQueue: boolean,
): OverboardFlashOriginWriter {
  if (
    lastWriter &&
    lastWriter.banId === banId &&
    nowMs() - lastWriter.atMs < 15_000
  ) {
    return lastWriter.writer;
  }
  if (
    lastSuccessDrain.ran &&
    lastSuccessDrain.materializedIds.includes(banId) &&
    lastSuccessDrain.stage
  ) {
    if (lastSuccessDrain.stage === 'local') return 'SUCCESS_LOCAL_BATCH';
    if (lastSuccessDrain.stage === 'transport') return 'SUCCESS_TRANSPORT_BATCH';
    return 'SUCCESS_RUNTIME_FALLBACK';
  }
  if (forcedByQueue) return 'DIRECT_OVERBOARD_FORCED_BY_QUEUE';
  return 'UNKNOWN';
}

function emptySnapshot(): OverboardFlashOriginSnapshot {
  return {
    successCardMounted: false,
    successExitDraining: false,
    runtimeLifecycle: null,
    runtimeAction: null,
    runtimeQueue: [],
    runtimeDisplayKind: null,
    runtimeDisplayId: null,
    runtimeDisplayOutcome: null,
    ownerQueue: [],
    effectiveNotificationQueueShellKind: null,
    queueResultOverlayClaimed: false,
    directOverboardRenderForcedByQueueResult: false,
    directOverboardVisible: false,
    resultOverlayVisible: false,
    openBanResultActiveId,
    receiveResultActiveId,
    lateResultActiveId,
  };
}

/**
 * Final visual boundary: call when an overboard result is actually mounted/
 * painted. Deduped per banId until cleared (dismiss / unmount).
 */
export function emitOverboardFlashOriginV1(args: {
  result: BanResult;
  mountSurface: 'ResultOverlay' | 'DirectOverboardResultLayer';
  resultOverlayVisible: boolean;
  directOverboardVisible?: boolean;
  directOverboardRenderForcedByQueueResult?: boolean;
}): void {
  const banId = args.result.id?.trim() ?? '';
  if (!banId) return;
  const outcome = resolveBanResultOutcome(args.result);
  if (outcome !== 'overboard') return;
  if (!args.resultOverlayVisible && !args.directOverboardVisible) return;

  const mountKey = `${banId}:${args.mountSurface}`;
  if (emittedMountKeys.has(mountKey)) return;
  emittedMountKeys.add(mountKey);

  const snap = snapshotReader?.() ?? emptySnapshot();
  const forced =
    args.directOverboardRenderForcedByQueueResult === true ||
    snap.directOverboardRenderForcedByQueueResult;
  const source = attributionFor(banId, forced);
  const buildCommit = overboardFlashOriginBuildCommit();
  const payload = {
    marker: OVERBOARD_FLASH_ORIGIN_V1,
    buildCommitSha: buildCommit,
    releaseId: buildCommit || null,
    expectedCommit: OVERBOARD_FLASH_ORIGIN_EXPECTED_COMMIT,
    buildMatchesExpected:
      buildCommit === OVERBOARD_FLASH_ORIGIN_EXPECTED_COMMIT ||
      buildCommit.startsWith(OVERBOARD_FLASH_ORIGIN_EXPECTED_COMMIT),
    buildTimestamp: PHASE12_BUILD_MARKER.buildTimestamp,
    buildEnv: PHASE12_BUILD_MARKER.nodeEnv,
    timestamp: Date.now(),
    perfNow: nowMs(),
    mountSurface: args.mountSurface,
    banId,
    outcome,
    successCardMounted: snap.successCardMounted,
    successExitDraining: snap.successExitDraining,
    runtimeLifecycle: snap.runtimeLifecycle,
    runtimeAction: snap.runtimeAction,
    runtimeQueue: snap.runtimeQueue,
    runtimeDisplayKind: snap.runtimeDisplayKind,
    runtimeDisplayId: snap.runtimeDisplayId,
    runtimeDisplayOutcome: snap.runtimeDisplayOutcome,
    ownerQueue: snap.ownerQueue,
    effectiveNotificationQueueShellKind:
      snap.effectiveNotificationQueueShellKind,
    queueResultOverlayClaimed: snap.queueResultOverlayClaimed,
    directOverboardRenderForcedByQueueResult: forced,
    directOverboardVisible:
      args.directOverboardVisible ?? snap.directOverboardVisible,
    resultOverlayVisible: args.resultOverlayVisible,
    openBanResultActiveId: snap.openBanResultActiveId ?? openBanResultActiveId,
    receiveResultActiveId: snap.receiveResultActiveId ?? receiveResultActiveId,
    lateResultActiveId: snap.lateResultActiveId ?? lateResultActiveId,
    source,
    resolveSuccessDrainBatchRan: lastSuccessDrain.ran,
    resolveSuccessDrainBatchStage: lastSuccessDrain.stage,
    withheldIds: lastSuccessDrain.withheldIds,
    materializedIds: lastSuccessDrain.materializedIds,
    flashedIdWasWithheld: lastSuccessDrain.withheldIds.includes(banId),
    flashedIdWasMaterialized: lastSuccessDrain.materializedIds.includes(banId),
  };

  console.info(OVERBOARD_FLASH_ORIGIN_V1, payload);
  if (typeof window !== 'undefined') {
    window.__debug98log?.(OVERBOARD_FLASH_ORIGIN_V1, payload);
  }
}

export function clearOverboardFlashOriginEmitForBan(
  banId: string | null | undefined,
): void {
  const id = (banId ?? '').trim();
  if (!id) return;
  emittedMountKeys.delete(`${id}:ResultOverlay`);
  emittedMountKeys.delete(`${id}:DirectOverboardResultLayer`);
}

/** Test-only reset. */
export function resetOverboardFlashOriginForTest(): void {
  snapshotReader = null;
  lastSuccessDrain = {
    ran: false,
    stage: null,
    withheldIds: [],
    materializedIds: [],
    atMs: 0,
  };
  lastWriter = null;
  openBanResultActiveId = null;
  receiveResultActiveId = null;
  lateResultActiveId = null;
  emittedMountKeys.clear();
}
