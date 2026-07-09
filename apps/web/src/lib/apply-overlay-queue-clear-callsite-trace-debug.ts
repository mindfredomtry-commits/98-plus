'use client';

import { getLastRenderBranchSnapshot } from '@/lib/render-branch-snapshot-debug';
import { queueHeadIdFrom } from '@/lib/queue-head-lifecycle-trace-debug';
import type { QueuedOverlay } from '@/lib/overlay-queue';
import {
  diagTraceNow,
  emitClientDiagTrace,
  isClientDiagTraceEnvironment,
} from '@/lib/diag-trace-client';

export type ApplyOverlayQueueClearCallsiteEnrichment = {
  lastActiveKind?: string | null;
  ownerQueueLen?: number;
  ownerPendingLen?: number;
  notificationOverlayVisible?: boolean;
  visualQueueDimSessionLive?: boolean;
  queueClaimsNotificationScreen?: boolean;
};

export type ApplyOverlayQueueClearCallsiteTraceInput = {
  caller: string;
  source: string;
  reason: string;
  nextQueueLength: number;
  sanitizedNextLength: number;
  operation: string | null;
  previousOverlayQueueLength: number;
  previousOverlayQueueHead: QueuedOverlay | null;
  sanitizedNext: QueuedOverlay[];
};

export type ApplyOverlayQueueClearCallsiteTrace = {
  timestamp: number;
  caller: string;
  source: string;
  reason: string;
  previousOverlayQueueLength: number;
  previousOverlayQueueHeadKind: string | null;
  previousOverlayQueueHeadId: string | null;
  nextOverlayQueueLength: number;
  lastActiveKind: string | null;
  lastRenderBranch: string | null;
  ownerQueueLen: number;
  ownerPendingLen: number;
  notificationOverlayVisible: boolean;
  visualQueueDimSessionLive: boolean;
  queueClaimsNotificationScreen: boolean;
  stack: string | null;
};

let enrichmentProvider: (() => ApplyOverlayQueueClearCallsiteEnrichment | null) | null =
  null;
const emittedSigs = new Set<string>();

export function registerApplyOverlayQueueClearCallsiteEnrichmentProvider(
  provider: (() => ApplyOverlayQueueClearCallsiteEnrichment | null) | null,
): void {
  enrichmentProvider = provider;
}

function captureStack(): string | null {
  try {
    return new Error('APPLY_OVERLAY_QUEUE_CLEAR_CALLSITE_TRACE').stack ?? null;
  } catch {
    return null;
  }
}

function shouldTraceClearCallsite(input: ApplyOverlayQueueClearCallsiteTraceInput): boolean {
  return (
    input.nextQueueLength === 0 ||
    input.sanitizedNextLength === 0 ||
    input.operation === 'clear'
  );
}

function buildClearCallsiteSignature(trace: ApplyOverlayQueueClearCallsiteTrace): string {
  return [
    trace.caller,
    trace.source,
    trace.reason,
    trace.previousOverlayQueueLength,
    trace.previousOverlayQueueHeadKind,
    trace.previousOverlayQueueHeadId,
    trace.nextOverlayQueueLength,
    trace.ownerQueueLen,
    trace.ownerPendingLen,
    trace.lastRenderBranch,
  ].join('|');
}

export function traceApplyOverlayQueueClearCallsiteIfNeeded(
  input: ApplyOverlayQueueClearCallsiteTraceInput,
): void {
  if (!isClientDiagTraceEnvironment()) return;
  if (!shouldTraceClearCallsite(input)) return;

  const enriched = enrichmentProvider?.() ?? {};
  const renderBranchSnapshot = getLastRenderBranchSnapshot();

  const payload: ApplyOverlayQueueClearCallsiteTrace = {
    timestamp: diagTraceNow(),
    caller: input.caller,
    source: input.source,
    reason: input.reason,
    previousOverlayQueueLength: input.previousOverlayQueueLength,
    previousOverlayQueueHeadKind: input.previousOverlayQueueHead?.kind ?? null,
    previousOverlayQueueHeadId: queueHeadIdFrom(input.previousOverlayQueueHead),
    nextOverlayQueueLength: input.sanitizedNextLength,
    lastActiveKind: enriched.lastActiveKind ?? null,
    lastRenderBranch: renderBranchSnapshot?.renderBranch ?? null,
    ownerQueueLen: enriched.ownerQueueLen ?? 0,
    ownerPendingLen: enriched.ownerPendingLen ?? 0,
    notificationOverlayVisible: enriched.notificationOverlayVisible ?? false,
    visualQueueDimSessionLive: enriched.visualQueueDimSessionLive ?? false,
    queueClaimsNotificationScreen: enriched.queueClaimsNotificationScreen ?? false,
    stack: captureStack(),
  };

  const sig = buildClearCallsiteSignature(payload);
  if (emittedSigs.has(sig)) return;
  emittedSigs.add(sig);
  emitClientDiagTrace('APPLY_OVERLAY_QUEUE_CLEAR_CALLSITE_TRACE', payload);
}
