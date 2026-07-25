/**
 * DIAGNOSTICS ONLY — Vertical V3 production execution ledger.
 *
 * Proves whether the overboard completion edge and CTA/chrome restore consumers
 * actually ran in a live Telegram/Railway deployment. Does not change product
 * authority, CTA state, overlay lifecycle, or queue advance.
 */
import { PHASE12_BUILD_MARKER } from '@/lib/phase12-build-marker';

export const OVERBOARD_V3_PROD_TRACE_MARKER = 'OVERBOARD_V3_PROD_TRACE' as const;
export const OVERBOARD_V3_PROD_TRACE_PREFIX = '[OVERBOARD_V3_PROD_TRACE]' as const;
/** Short SHA expected for the V3 CTA-release deployment under audit. */
export const OVERBOARD_V3_EXPECTED_COMMIT = '70aff52' as const;
export const OVERBOARD_V3_WRITER_WATCH_MS = 2000 as const;

export type OverboardV3ProdTraceStep =
  | 'BUILD_BOOT'
  | 'CARD_ACTION_REQUESTED'
  | 'SUBMIT_CARD_ACTION_START'
  | 'SUBMIT_CARD_ACTION_RESULT'
  | 'STATE_BEFORE_SUCCESS'
  | 'CARD_ACTION_SUCCEEDED'
  | 'STATE_AFTER_SUCCESS'
  | 'COMPLETION_ELIGIBILITY'
  | 'COMPLETION_EDGE'
  | 'INSTANTBANFLOW_SUBSCRIBER_MOUNTED'
  | 'INSTANTBANFLOW_EDGE'
  | 'INSTANTBANFLOW_CTA_RESTORE'
  | 'PROVIDERS_SUBSCRIBER_MOUNTED'
  | 'PROVIDERS_EDGE'
  | 'PROVIDERS_PIN_RELEASE'
  | 'WRITER_WATCH_ARMED'
  | 'WRITER_CHANGE'
  | 'WRITER_WATCH_ENDED';

export type OverboardV3WriterField =
  | 'ctaState'
  | 'notificationOverlayMounted'
  | 'notificationChainTransitioning'
  | 'activeIncomingOverlayBan'
  | 'orbOverlayDim'
  | 'visualQueueDimSession';

type WriterWatch = {
  untilMs: number;
  commandId: string | null;
  seq: number | null;
  timer: ReturnType<typeof setTimeout> | null;
};

let currentCommandId: string | null = null;
let currentTraceId: string | null = null;
let writerWatch: WriterWatch | null = null;

function shortId(): string {
  try {
    if (
      typeof crypto !== 'undefined' &&
      typeof crypto.randomUUID === 'function'
    ) {
      return crypto.randomUUID().split('-')[0] ?? '';
    }
  } catch {
    // fall through
  }
  return Math.random().toString(16).slice(2, 10);
}

function nowMs(): number {
  return typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now();
}

/** Baked commit from next.config / Railway (client-inlined NEXT_PUBLIC_*). */
export function overboardV3ProdTraceBuildCommit(): string {
  return (
    PHASE12_BUILD_MARKER.buildCommit ||
    process.env.NEXT_PUBLIC_BUILD_COMMIT ||
    process.env.NEXT_PUBLIC_RAILWAY_GIT_COMMIT_SHA ||
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    'unknown'
  );
}

export function overboardV3BuildMatchesExpected(): boolean {
  const commit = overboardV3ProdTraceBuildCommit();
  if (!commit || commit === 'unknown') return false;
  return (
    commit === OVERBOARD_V3_EXPECTED_COMMIT ||
    commit.startsWith(OVERBOARD_V3_EXPECTED_COMMIT)
  );
}

export function beginOverboardV3ProdTrace(commandId: string): string {
  currentCommandId = commandId;
  currentTraceId = `ob3_${shortId()}`;
  return currentTraceId;
}

export function getOverboardV3ProdTraceCommandId(): string | null {
  return currentCommandId;
}

export function getOverboardV3ProdTraceId(): string | null {
  return currentTraceId;
}

export function logOverboardV3ProdTrace(
  step: OverboardV3ProdTraceStep,
  data: Record<string, unknown> = {},
): void {
  const entry = {
    marker: OVERBOARD_V3_PROD_TRACE_MARKER,
    step,
    traceId: currentTraceId,
    commandId: (data.commandId as string | null | undefined) ?? currentCommandId,
    buildCommit: overboardV3ProdTraceBuildCommit(),
    expectedCommit: OVERBOARD_V3_EXPECTED_COMMIT,
    buildMatchesExpected: overboardV3BuildMatchesExpected(),
    timestamp: nowMs(),
    ...data,
  };
  console.info(OVERBOARD_V3_PROD_TRACE_PREFIX, entry);
  if (typeof window !== 'undefined') {
    window.__debug98log?.(OVERBOARD_V3_PROD_TRACE_MARKER, entry);
  }
}

/** One-shot boot line — proves which commit Telegram actually loaded. */
export function logOverboardV3ProdTraceBoot(): void {
  const commit = overboardV3ProdTraceBuildCommit();
  const entry = {
    marker: OVERBOARD_V3_PROD_TRACE_MARKER,
    step: 'BUILD_BOOT' as const,
    buildCommit: commit,
    expectedCommit: OVERBOARD_V3_EXPECTED_COMMIT,
    buildMatchesExpected: overboardV3BuildMatchesExpected(),
    buildTimestamp: PHASE12_BUILD_MARKER.buildTimestamp,
    buildEnv: PHASE12_BUILD_MARKER.nodeEnv,
    href: typeof window !== 'undefined' ? window.location.href : null,
    timestamp: nowMs(),
  };
  console.info(OVERBOARD_V3_PROD_TRACE_PREFIX, entry);
  if (typeof window !== 'undefined') {
    (
      window as unknown as {
        __98PLUS_OVERBOARD_V3_BUILD__?: Record<string, unknown>;
      }
    ).__98PLUS_OVERBOARD_V3_BUILD__ = {
      buildCommit: commit,
      expectedCommit: OVERBOARD_V3_EXPECTED_COMMIT,
      buildMatchesExpected: overboardV3BuildMatchesExpected(),
      buildTimestamp: PHASE12_BUILD_MARKER.buildTimestamp,
    };
    window.__debug98log?.(OVERBOARD_V3_PROD_TRACE_MARKER, entry);
  }
}

export function isOverboardV3WriterWatchActive(): boolean {
  if (!writerWatch) return false;
  return nowMs() <= writerWatch.untilMs;
}

/**
 * Arm a 2s diagnostic window after V3 consumers. Product timers are unchanged —
 * this only logs subsequent writers of the watched fields.
 */
export function armOverboardV3WriterWatch(args: {
  commandId: string | null;
  seq: number | null;
  reason: string;
}): void {
  if (writerWatch?.timer) {
    clearTimeout(writerWatch.timer);
  }
  const untilMs = nowMs() + OVERBOARD_V3_WRITER_WATCH_MS;
  writerWatch = {
    untilMs,
    commandId: args.commandId,
    seq: args.seq,
    timer: setTimeout(() => {
      logOverboardV3ProdTrace('WRITER_WATCH_ENDED', {
        commandId: args.commandId,
        seq: args.seq,
        watchMs: OVERBOARD_V3_WRITER_WATCH_MS,
        reason: 'window-elapsed',
      });
      writerWatch = null;
    }, OVERBOARD_V3_WRITER_WATCH_MS),
  };
  logOverboardV3ProdTrace('WRITER_WATCH_ARMED', {
    commandId: args.commandId,
    seq: args.seq,
    watchMs: OVERBOARD_V3_WRITER_WATCH_MS,
    reason: args.reason,
  });
}

export function logOverboardV3WriterChange(args: {
  field: OverboardV3WriterField;
  oldValue: unknown;
  newValue: unknown;
  source: string;
  commandId?: string | null;
  seq?: number | null;
}): void {
  if (!isOverboardV3WriterWatchActive() && !args.source.includes('v3-consumer')) {
    // Outside the watch window only accept explicit consumer-tagged sources
    // so we still capture the restore writes themselves.
    return;
  }
  if (Object.is(args.oldValue, args.newValue)) return;
  logOverboardV3ProdTrace('WRITER_CHANGE', {
    field: args.field,
    oldValue: args.oldValue,
    newValue: args.newValue,
    source: args.source,
    commandId: args.commandId ?? writerWatch?.commandId ?? currentCommandId,
    seq: args.seq ?? writerWatch?.seq ?? null,
    watchActive: isOverboardV3WriterWatchActive(),
  });
}

/** Compact runtime snapshot for before/after success ledger rows. */
export function snapshotRuntimeForOverboardV3Trace(state: {
  lifecycle: { status: string };
  display: { kind: string | null; payload: unknown };
  items: { queue: unknown[] };
  action: {
    status: string;
    commandId: string | null;
    targetItemId: string | null;
  };
}): Record<string, unknown> {
  return {
    lifecycle: state.lifecycle.status,
    displayKind: state.display.kind,
    displayPayloadNull: state.display.payload == null,
    queueLen: state.items.queue.length,
    actionStatus: state.action.status,
    actionCommandId: state.action.commandId,
    actionTargetItemId: state.action.targetItemId,
  };
}
