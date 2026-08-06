/**
 * Stage 8 Phase 9I — deterministic production-trace replay helpers.
 *
 * Consumes exported JSON from notifications-production-recorder.
 * Drives real Coordinator / Runtime modules where possible; mocks only
 * HTTP/WS/time/Telegram host inputs from the trace.
 *
 * Does not claim production failure reproduction until an actual exported
 * production trace is loaded.
 */
import type {
  NotificationsRecorderEvent,
  NotificationsRecorderTrace,
} from './notifications-production-recorder';
import {
  NOTIFICATIONS_PRODUCTION_RECORDER_SCHEMA_VERSION,
  sanitizeRecorderValue,
} from './notifications-production-recorder';

export const REPLAY_REPRODUCED_PRODUCTION_FAILURE =
  'REPLAY_REPRODUCED_PRODUCTION_FAILURE' as const;

export const PRODUCTION_TRACE_NOT_AVAILABLE =
  'PRODUCTION_TRACE_NOT_AVAILABLE' as const;

export type TraceDivergenceReport = {
  lastSuccessfulCycle: number | null;
  failedCycle: number | null;
  firstDifferentStage: string | null;
  successfulEvent: NotificationsRecorderEvent | null;
  failedEvent: NotificationsRecorderEvent | null;
  stateDifference: Record<string, unknown>;
};

export type ReplayResult = {
  status:
    | typeof REPLAY_REPRODUCED_PRODUCTION_FAILURE
    | typeof PRODUCTION_TRACE_NOT_AVAILABLE
    | 'REPLAY_DID_NOT_REPRODUCE'
    | 'REPLAY_RAN_SYNTHETIC_ONLY';
  divergence: TraceDivergenceReport | null;
  missingInputs: string[];
  finalOwner: string | null;
  finalActiveItemId: string | null;
  notes: string[];
};

export type VirtualClock = {
  nowMs: number;
  advanceTo(ms: number): void;
  advanceBy(ms: number): void;
};

export function createVirtualClock(startMs = 0): VirtualClock {
  let nowMs = startMs;
  return {
    get nowMs() {
      return nowMs;
    },
    advanceTo(ms: number) {
      if (ms > nowMs) nowMs = ms;
    },
    advanceBy(ms: number) {
      nowMs += Math.max(0, ms);
    },
  };
}

export function parseNotificationsProductionTrace(
  json: string | NotificationsRecorderTrace,
): NotificationsRecorderTrace {
  const raw =
    typeof json === 'string'
      ? (JSON.parse(json) as NotificationsRecorderTrace)
      : json;
  if (raw.schemaVersion !== NOTIFICATIONS_PRODUCTION_RECORDER_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported trace schemaVersion: ${String(raw.schemaVersion)}`,
    );
  }
  if (!Array.isArray(raw.events)) {
    throw new Error('Trace missing events[]');
  }
  return {
    ...raw,
    events: raw.events.map((e) => ({
      ...e,
      stateBefore: e.stateBefore
        ? (sanitizeRecorderValue(e.stateBefore) as Record<string, unknown>)
        : null,
      stateAfter: e.stateAfter
        ? (sanitizeRecorderValue(e.stateAfter) as Record<string, unknown>)
        : null,
      metadata: (sanitizeRecorderValue(e.metadata ?? {}) as Record<
        string,
        unknown
      >) ?? {},
    })),
  };
}

export function eventsForCycle(
  trace: NotificationsRecorderTrace,
  cycleNumber: number,
): NotificationsRecorderEvent[] {
  return trace.events.filter((e) => e.cycleNumber === cycleNumber);
}

export function analyzeCycleDivergence(
  trace: NotificationsRecorderTrace,
): TraceDivergenceReport {
  const failed =
    trace.summary.failedCycleNumber ??
    trace.events.find((e) => e.stage === 'CYCLE_FAILED')?.cycleNumber ??
    null;
  const lastSuccessful =
    failed != null && failed > 1
      ? failed - 1
      : trace.summary.successfulCycles > 0
        ? trace.summary.successfulCycles
        : null;

  if (failed == null || lastSuccessful == null) {
    return {
      lastSuccessfulCycle: lastSuccessful,
      failedCycle: failed,
      firstDifferentStage: null,
      successfulEvent: null,
      failedEvent: null,
      stateDifference: {
        reason: 'missing_success_or_failure_cycle',
      },
    };
  }

  const successEvents = eventsForCycle(trace, lastSuccessful);
  const failEvents = eventsForCycle(trace, failed);
  const successStages = successEvents.map((e) => e.stage);
  const failStages = failEvents.map((e) => e.stage);

  let firstDifferentStage: string | null = null;
  let successfulEvent: NotificationsRecorderEvent | null = null;
  let failedEvent: NotificationsRecorderEvent | null = null;
  const n = Math.max(successStages.length, failStages.length);
  for (let i = 0; i < n; i++) {
    const s = successStages[i];
    const f = failStages[i];
    if (s !== f) {
      firstDifferentStage = f ?? s ?? null;
      successfulEvent = successEvents[i] ?? null;
      failedEvent = failEvents[i] ?? null;
      break;
    }
  }

  if (firstDifferentStage == null && failEvents.length) {
    const lastFail = failEvents[failEvents.length - 1]!;
    firstDifferentStage = lastFail.stage;
    failedEvent = lastFail;
    successfulEvent = successEvents[successEvents.length - 1] ?? null;
  }

  const stateDifference: Record<string, unknown> = {
    successLastStage: successStages[successStages.length - 1] ?? null,
    failLastStage: failStages[failStages.length - 1] ?? null,
    successOwner: pickOwner(successEvents),
    failOwner: pickOwner(failEvents),
    successActiveItemId: pickActive(successEvents),
    failActiveItemId: pickActive(failEvents),
    successHadCardMount: successEvents.some(
      (e) => e.stage === 'NOTIFICATION_CARD_MOUNT',
    ),
    failHadCardMount: failEvents.some(
      (e) => e.stage === 'NOTIFICATION_CARD_MOUNT',
    ),
    failureClass: trace.summary.failureClass,
    failureStage: trace.summary.failureStage,
  };

  return {
    lastSuccessfulCycle: lastSuccessful,
    failedCycle: failed,
    firstDifferentStage,
    successfulEvent,
    failedEvent,
    stateDifference,
  };
}

function pickOwner(events: NotificationsRecorderEvent[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const o = events[i]?.stateAfter?.currentOwner;
    if (typeof o === 'string') return o;
  }
  return null;
}

function pickActive(events: NotificationsRecorderEvent[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const a = events[i]?.stateAfter?.activeItemId;
    if (a != null) return String(a);
  }
  return null;
}

/**
 * Assert structural invariants of an exported production failure trace
 * without claiming local module replay yet.
 */
export function assertProductionFailureShape(
  trace: NotificationsRecorderTrace,
): { ok: true } | { ok: false; missing: string[] } {
  const missing: string[] = [];
  if (trace.summary.failedCycleNumber == null) {
    missing.push('summary.failedCycleNumber');
  }
  if (!trace.events.some((e) => e.stage === 'CYCLE_FAILED')) {
    missing.push('CYCLE_FAILED');
  }
  if (!trace.events.some((e) => e.stage === 'LOBBY_YOUR_BANS_CLICK')) {
    missing.push('LOBBY_YOUR_BANS_CLICK');
  }
  const failed = trace.summary.failedCycleNumber;
  if (failed != null) {
    const cycle = eventsForCycle(trace, failed);
    const hadOpen = cycle.some(
      (e) =>
        e.stage === 'LOBBY_YOUR_BANS_CLICK' || e.stage === 'CYCLE_STARTED',
    );
    if (!hadOpen) missing.push(`cycle[${failed}].open_click`);
    const mounted = cycle.some((e) => e.stage === 'NOTIFICATION_CARD_MOUNT');
    if (mounted) {
      // Failure after mount is still valid; note only.
    } else if (
      !cycle.some(
        (e) =>
          e.stage === 'COORDINATOR_OPEN_REJECTED' ||
          e.stage === 'PRESENTER_OUTPUT_EMPTY' ||
          e.stage === 'APPLICATION_SURFACE_BRANCH_CREATE_BAN' ||
          e.stage === 'CYCLE_FAILED',
      )
    ) {
      missing.push(`cycle[${failed}].failure_marker`);
    }
  }
  return missing.length ? { ok: false, missing } : { ok: true };
}

export type ModuleReplayHarness = {
  /** Current owner label after last applied action. */
  getOwner(): string;
  getActiveItemId(): string | null;
  /** Apply a recorded open click through real openNotifications. */
  openNotifications(correlationId?: string | null): {
    ok: boolean;
    code?: string;
  };
  /** Apply close through real domain intent. */
  closeActive(): void;
  /** Optional: inject sync snapshot/delta from recorded metadata. */
  applyRecordedSync?(event: NotificationsRecorderEvent): void;
};

/**
 * Replay high-level open/close intents from a trace against real modules.
 * Relative timing is preserved via virtual clock (observational for schedulers).
 */
export function replayTraceIntents(
  trace: NotificationsRecorderTrace,
  harness: ModuleReplayHarness,
  clock: VirtualClock = createVirtualClock(),
): ReplayResult {
  const notes: string[] = [];
  const missingInputs: string[] = [];
  const divergence = analyzeCycleDivergence(trace);

  let lastMono = 0;
  for (const event of trace.events) {
    clock.advanceTo(event.monotonicTimeMs);
    if (event.monotonicTimeMs < lastMono) {
      notes.push(`non_monotonic_time_at_seq_${event.globalSeq}`);
    }
    lastMono = event.monotonicTimeMs;

    if (
      event.stage === 'HTTP_SYNC_BEGIN' ||
      event.stage === 'WS_DELTA_RECEIVED'
    ) {
      if (!harness.applyRecordedSync) {
        missingInputs.push(`${event.stage}@${event.globalSeq}`);
      } else {
        harness.applyRecordedSync(event);
      }
    }

    if (event.stage === 'LOBBY_YOUR_BANS_CLICK') {
      harness.openNotifications(event.correlationId);
    }
    if (
      event.stage === 'NOTIFICATION_CARD_CLOSE_CLICK' ||
      event.stage === 'RUNTIME_CLOSE_RECEIVED'
    ) {
      // Deduplicate close pairs in the same cycle by only acting on CLOSE_CLICK.
      if (event.stage === 'NOTIFICATION_CARD_CLOSE_CLICK') {
        harness.closeActive();
      }
    }
  }

  const finalOwner = harness.getOwner();
  const finalActiveItemId = harness.getActiveItemId();

  const productionFailed =
    trace.summary.failedCycleNumber != null &&
    trace.events.some((e) => e.stage === 'CYCLE_FAILED');

  if (!productionFailed) {
    return {
      status: 'REPLAY_DID_NOT_REPRODUCE',
      divergence,
      missingInputs,
      finalOwner,
      finalActiveItemId,
      notes: [...notes, 'trace_has_no_failed_cycle'],
    };
  }

  // Production-equivalent end state: after failed click, Lobby remains or
  // Ban1 did not mount — owner CREATE_BAN and/or null active item.
  const failCycle = divergence.failedCycle;
  const failEvents =
    failCycle != null ? eventsForCycle(trace, failCycle) : [];
  const productionEndedOnLobby =
    pickOwner(failEvents) === 'CREATE_BAN' ||
    failEvents.some(
      (e) =>
        e.stage === 'APPLICATION_SURFACE_BRANCH_CREATE_BAN' ||
        e.stage === 'COORDINATOR_OPEN_REJECTED' ||
        e.rejectionReason != null,
    ) ||
    !failEvents.some((e) => e.stage === 'NOTIFICATION_CARD_MOUNT');

  const localMatches =
    (finalOwner === 'CREATE_BAN' || finalActiveItemId == null) &&
    productionEndedOnLobby;

  if (localMatches && missingInputs.length === 0) {
    return {
      status: REPLAY_REPRODUCED_PRODUCTION_FAILURE,
      divergence,
      missingInputs,
      finalOwner,
      finalActiveItemId,
      notes,
    };
  }

  if (missingInputs.length) {
    notes.push(
      'Cannot claim full reproduction — sync/async inputs missing from harness',
    );
  }

  return {
    status: 'REPLAY_DID_NOT_REPRODUCE',
    divergence,
    missingInputs,
    finalOwner,
    finalActiveItemId,
    notes,
  };
}

export function describeProductionTraceAvailability(
  pathOrNull: string | null,
): ReplayResult {
  return {
    status: PRODUCTION_TRACE_NOT_AVAILABLE,
    divergence: null,
    missingInputs: pathOrNull
      ? [`unreadable:${pathOrNull}`]
      : ['no_production_trace_file'],
    finalOwner: null,
    finalActiveItemId: null,
    notes: [
      'Phase 9I stop: capture a production export via window.__NOTIFICATIONS_PRODUCTION_RECORDER__ before claiming REPLAY_REPRODUCED_PRODUCTION_FAILURE',
    ],
  };
}
