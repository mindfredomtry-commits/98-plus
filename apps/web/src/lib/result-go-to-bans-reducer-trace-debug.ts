'use client';

import type { QueuedOverlay } from '@/lib/overlay-queue';
import { overlayBanId } from '@/lib/overlay-queue';
import { normalizeId } from '@/lib/normalize-json';
import { queueHeadIdFrom } from '@/lib/queue-head-lifecycle-trace-debug';
import {
  diagTraceNow,
  emitClientDiagTrace,
  isClientDiagTraceEnvironment,
} from '@/lib/diag-trace-client';

export type ResultGoToBansReducerTraceStage =
  | 'entry'
  | 'before-filter'
  | 'after-filter'
  | 'before-return';

export type ResultGoToBansReducerTraceInput = {
  stage: ResultGoToBansReducerTraceStage;
  actionBanId: string;
  banId: string;
  stateQueue: QueuedOverlay[];
  statePending: QueuedOverlay[];
  nextQueue?: QueuedOverlay[];
  nextPending?: QueuedOverlay[];
  removedQueue?: QueuedOverlay[];
  keptQueue?: QueuedOverlay[];
  filterItemKinds?: string[];
  filterItemIds?: (string | null)[];
  filterItemBanIds?: string[];
  filterItemMatches?: boolean[];
  filterReasons?: string[];
  includeStack?: boolean;
};

export type ResultGoToBansReducerTrace = {
  timestamp: number;
  stage: ResultGoToBansReducerTraceStage;
  actionBanId: string;
  banId: string;
  stateQueueLength: number;
  stateQueueKinds: string[];
  stateQueueIds: string[];
  stateQueueBanIds: string[];
  statePendingLength: number;
  statePendingKinds: string[];
  statePendingIds: string[];
  statePendingBanIds: string[];
  nextQueueLength: number | null;
  nextQueueKinds: string[];
  nextQueueIds: string[];
  nextQueueBanIds: string[];
  removedQueueItems: number;
  removedQueueKinds: string[];
  removedQueueIds: string[];
  removedQueueBanIds: string[];
  keptQueueItems: number;
  keptQueueKinds: string[];
  keptQueueIds: string[];
  keptQueueBanIds: string[];
  filterReason: string[];
  itemKind: string[];
  itemId: (string | null)[];
  itemBanId: string[];
  itemMatchesActionBanId: boolean[];
  stack: string | null;
};

function queueKinds(queue: QueuedOverlay[]): string[] {
  return queue.map((item) => item.kind);
}

function queueIds(queue: QueuedOverlay[]): string[] {
  return queue
    .map((item) => queueHeadIdFrom(item))
    .filter((id): id is string => id != null);
}

function queueBanIds(queue: QueuedOverlay[]): string[] {
  return queue.map((item) => normalizeId(overlayBanId(item)));
}

function captureReducerTraceStack(): string {
  try {
    return new Error('RESULT_GO_TO_BANS_REDUCER_TRACE').stack ?? '';
  } catch {
    return '';
  }
}

export function buildResultGoToBansFilterItemTrace(
  stateQueue: QueuedOverlay[],
  actionBanId: string,
): Pick<
  ResultGoToBansReducerTraceInput,
  | 'filterItemKinds'
  | 'filterItemIds'
  | 'filterItemBanIds'
  | 'filterItemMatches'
  | 'filterReasons'
> {
  const filterItemKinds: string[] = [];
  const filterItemIds: (string | null)[] = [];
  const filterItemBanIds: string[] = [];
  const filterItemMatches: boolean[] = [];
  const filterReasons: string[] = [];

  for (const item of stateQueue) {
    const itemBanId = normalizeId(overlayBanId(item));
    const matches = itemBanId === actionBanId;
    filterItemKinds.push(item.kind);
    filterItemIds.push(queueHeadIdFrom(item));
    filterItemBanIds.push(itemBanId);
    filterItemMatches.push(matches);
    filterReasons.push(
      matches
        ? 'overlayBanId-equals-actionBanId:removed'
        : 'overlayBanId-not-actionBanId:kept',
    );
  }

  return {
    filterItemKinds,
    filterItemIds,
    filterItemBanIds,
    filterItemMatches,
    filterReasons,
  };
}

export function logResultGoToBansReducerTrace(
  input: ResultGoToBansReducerTraceInput,
): void {
  if (!isClientDiagTraceEnvironment()) return;

  const removedQueue = input.removedQueue ?? [];
  const keptQueue = input.keptQueue ?? [];
  const nextQueue = input.nextQueue ?? [];
  const stateQueueLength = input.stateQueue.length;
  const nextQueueLength =
    input.stage === 'entry' || input.stage === 'before-filter'
      ? null
      : nextQueue.length;

  const payload: ResultGoToBansReducerTrace = {
    timestamp: diagTraceNow(),
    stage: input.stage,
    actionBanId: input.actionBanId,
    banId: input.banId,
    stateQueueLength,
    stateQueueKinds: queueKinds(input.stateQueue),
    stateQueueIds: queueIds(input.stateQueue),
    stateQueueBanIds: queueBanIds(input.stateQueue),
    statePendingLength: input.statePending.length,
    statePendingKinds: queueKinds(input.statePending),
    statePendingIds: queueIds(input.statePending),
    statePendingBanIds: queueBanIds(input.statePending),
    nextQueueLength,
    nextQueueKinds: queueKinds(nextQueue),
    nextQueueIds: queueIds(nextQueue),
    nextQueueBanIds: queueBanIds(nextQueue),
    removedQueueItems: removedQueue.length,
    removedQueueKinds: queueKinds(removedQueue),
    removedQueueIds: queueIds(removedQueue),
    removedQueueBanIds: queueBanIds(removedQueue),
    keptQueueItems: keptQueue.length,
    keptQueueKinds: queueKinds(keptQueue),
    keptQueueIds: queueIds(keptQueue),
    keptQueueBanIds: queueBanIds(keptQueue),
    filterReason: input.filterReasons ?? [],
    itemKind: input.filterItemKinds ?? [],
    itemId: input.filterItemIds ?? [],
    itemBanId: input.filterItemBanIds ?? [],
    itemMatchesActionBanId: input.filterItemMatches ?? [],
    stack: input.includeStack ? captureReducerTraceStack() : null,
  };

  emitClientDiagTrace('RESULT_GO_TO_BANS_REDUCER_TRACE', payload);
}
