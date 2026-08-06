/**
 * Stage 8 Phase 9I — production Notifications execution recorder.
 *
 * Observational only. Disabled by default. Does not mutate Coordinator /
 * Runtime / Presenter state. Does not send data externally.
 *
 * Console:
 *   window.__NOTIFICATIONS_PRODUCTION_RECORDER__.clear()
 *   window.__NOTIFICATIONS_PRODUCTION_RECORDER__.start()
 *   // … reproduce Open→Close until failure …
 *   window.__NOTIFICATIONS_PRODUCTION_RECORDER__.stop()
 *   window.__NOTIFICATIONS_PRODUCTION_RECORDER__.getSummary()
 *   window.__NOTIFICATIONS_PRODUCTION_RECORDER__.exportTrace()
 */
export const NOTIFICATIONS_PRODUCTION_RECORDER_SCHEMA_VERSION = 1 as const;

/** Diagnostic mount-wait threshold (ms). Does not trigger product retry. */
export const CYCLE_OPEN_DIAGNOSTIC_THRESHOLD_MS = 5000;

export type NotificationsRecorderStage =
  | 'APP_BOOT'
  | 'LOBBY_MOUNT'
  | 'LOBBY_UNMOUNT'
  | 'LOBBY_YOUR_BANS_POINTER_DOWN'
  | 'LOBBY_YOUR_BANS_CLICK'
  | 'LOBBY_OPEN_INTENT_CREATED'
  | 'LOBBY_OPEN_HANDLER_BEGIN'
  | 'LOBBY_OPEN_HANDLER_END'
  | 'COORDINATOR_OPEN_BEGIN'
  | 'COORDINATOR_OPEN_REENTRANT'
  | 'COORDINATOR_CAPABILITY_READ'
  | 'COORDINATOR_OPEN_REJECTED'
  | 'COORDINATOR_OPEN_TRANSACTION_BEGIN'
  | 'COORDINATOR_OPEN_TRANSACTION_ABORT'
  | 'COORDINATOR_OPEN_TRANSACTION_COMMIT'
  | 'COORDINATOR_OWNER_BEFORE_COMMIT'
  | 'COORDINATOR_OWNER_AFTER_COMMIT'
  | 'COORDINATOR_SUBSCRIBERS_NOTIFY_BEGIN'
  | 'COORDINATOR_SUBSCRIBERS_NOTIFY_END'
  | 'RUNTIME_COMMAND_RECEIVED'
  | 'RUNTIME_SESSION_BEGIN_BEFORE'
  | 'RUNTIME_SESSION_BEGIN_AFTER'
  | 'RUNTIME_ACTIVATE_BEGIN'
  | 'RUNTIME_NEXT_ITEM_SELECTED'
  | 'RUNTIME_ACTIVATE_RESULT'
  | 'RUNTIME_STATE_AFTER_ACTIVATE'
  | 'RUNTIME_CLOSE_RECEIVED'
  | 'RUNTIME_DEACTIVATE_BEGIN'
  | 'RUNTIME_ITEM_REINSERTED'
  | 'RUNTIME_DEACTIVATE_END'
  | 'RUNTIME_SESSION_COMPLETE_CREATED'
  | 'RUNTIME_SESSION_COMPLETE_DISPATCHED'
  | 'RUNTIME_STALE_EVENT_RECEIVED'
  | 'RUNTIME_EFFECT_CREATED'
  | 'RUNTIME_EFFECT_EXECUTED'
  | 'RUNTIME_EFFECT_COMPLETED'
  | 'COORDINATOR_RELEASE_RECEIVED'
  | 'COORDINATOR_RELEASE_ACCEPTED'
  | 'COORDINATOR_RELEASE_REJECTED'
  | 'COORDINATOR_OWNER_RETURN_BEGIN'
  | 'COORDINATOR_OWNER_RETURN_COMMIT'
  | 'CONTROLLER_CREATED'
  | 'CONTROLLER_DISPOSED'
  | 'CONTROLLER_SUBSCRIBE'
  | 'CONTROLLER_UNSUBSCRIBE'
  | 'CONTROLLER_RUNTIME_SNAPSHOT_RECEIVED'
  | 'CONTROLLER_SNAPSHOT_PUBLISHED'
  | 'CONTROLLER_SNAPSHOT_DEDUPED'
  | 'PRESENTER_CREATED'
  | 'PRESENTER_DISPOSED'
  | 'PRESENTER_INPUT'
  | 'PRESENTER_OUTPUT_ITEM'
  | 'PRESENTER_OUTPUT_EMPTY'
  | 'PRESENTER_OUTPUT_ERROR'
  | 'PRESENTER_OUTPUT_DEDUPED'
  | 'APPLICATION_SURFACE_RENDER'
  | 'APPLICATION_SURFACE_OWNER_READ'
  | 'APPLICATION_SURFACE_BRANCH_CREATE_BAN'
  | 'APPLICATION_SURFACE_BRANCH_NOTIFICATIONS'
  | 'APPLICATION_SURFACE_INVARIANT_VIOLATION'
  | 'NOTIFICATION_HOST_MOUNT'
  | 'NOTIFICATION_HOST_UNMOUNT'
  | 'NOTIFICATION_CARD_MOUNT'
  | 'NOTIFICATION_CARD_UNMOUNT'
  | 'NOTIFICATION_CARD_RENDER'
  | 'NOTIFICATION_CARD_CLOSE_POINTER_DOWN'
  | 'NOTIFICATION_CARD_CLOSE_CLICK'
  | 'NOTIFICATION_CARD_CLOSE_INTENT_DISPATCHED'
  | 'NOTIFICATION_CARD_INSTANCE_CREATED'
  | 'HTTP_SYNC_BEGIN'
  | 'HTTP_SYNC_RESPONSE'
  | 'HTTP_SYNC_COMPLETE'
  | 'HTTP_SYNC_FAILED'
  | 'WS_DELTA_RECEIVED'
  | 'WS_DELTA_MAPPED'
  | 'SYNC_FLIGHT_BEGIN'
  | 'SYNC_FLIGHT_COMPLETE'
  | 'SYNC_FLIGHT_STALE_COMPLETE'
  | 'RECONCILIATION_BEGIN'
  | 'RECONCILIATION_RESULT'
  | 'FULL_SYNC_REQUESTED'
  | 'ASYNC_TASK_SCHEDULED'
  | 'ASYNC_TASK_STARTED'
  | 'ASYNC_TASK_COMPLETED'
  | 'ASYNC_TASK_CANCELLED'
  | 'TIMER_SCHEDULED'
  | 'TIMER_FIRED'
  | 'TIMER_CANCELLED'
  | 'ABORT_SIGNAL'
  | 'CLEANUP_BEGIN'
  | 'CLEANUP_END'
  | 'CYCLE_STARTED'
  | 'CYCLE_OPEN_SUCCEEDED'
  | 'CYCLE_CLOSE_SUCCEEDED'
  | 'CYCLE_FAILED'
  | 'CYCLE_FAILURE_CLASSIFIED'
  | 'TRACE_CAPACITY_REACHED'
  | 'RECORDER_MARK'
  | 'RECORDER_STARTED'
  | 'RECORDER_STOPPED';

export type NotificationsRecorderFailureClass =
  | 'CLICK_NOT_RECEIVED'
  | 'OPEN_REJECTED'
  | 'OWNER_DID_NOT_CHANGE'
  | 'RUNTIME_DID_NOT_ACTIVATE'
  | 'PRESENTER_EMPTY'
  | 'APPLICATION_SURFACE_LOBBY'
  | 'STALE_EVENT_REVERTED_SESSION'
  | 'SYNC_REPLACED_STATE'
  | 'REACT_DID_NOT_MOUNT_CARD'
  | 'UNKNOWN';

export type NotificationsRecorderEvent = {
  globalSeq: number;
  monotonicTimeMs: number;
  wallClockTime: string;
  appSessionId: string;
  recorderSessionId: string;
  cycleNumber: number;
  openAttemptId: string | null;
  closeAttemptId: string | null;
  correlationId: string | null;
  source: string;
  stage: NotificationsRecorderStage;
  eventName: string;
  stateBefore: Record<string, unknown> | null;
  stateAfter: Record<string, unknown> | null;
  result: string | null;
  rejectionReason: string | null;
  error: string | null;
  metadata: Record<string, unknown>;
};

export type NotificationsRecorderTrace = {
  schemaVersion: typeof NOTIFICATIONS_PRODUCTION_RECORDER_SCHEMA_VERSION;
  build: {
    gitSha: string | null;
    branch: string | null;
    environment: string | null;
    appVersion: string | null;
  };
  session: {
    appSessionId: string;
    recorderSessionId: string;
    startedAt: string;
    userAgentSummary: string | null;
    telegramEnvironment: string | null;
  };
  summary: {
    successfulCycles: number;
    failedCycleNumber: number | null;
    failureStage: string | null;
    failureClass: NotificationsRecorderFailureClass | null;
    finalOwner: string | null;
    finalCapability: string | null;
    finalActiveItemId: string | null;
  };
  events: NotificationsRecorderEvent[];
};

export type NotificationsRecorderSummary = NotificationsRecorderTrace['summary'] & {
  running: boolean;
  eventCount: number;
  capacity: number;
  lastStage: string | null;
};

export type RecordEventInput = {
  source: string;
  stage: NotificationsRecorderStage;
  eventName?: string;
  correlationId?: string | null;
  openAttemptId?: string | null;
  closeAttemptId?: string | null;
  stateBefore?: Record<string, unknown> | null;
  stateAfter?: Record<string, unknown> | null;
  result?: string | null;
  rejectionReason?: string | null;
  error?: string | null;
  metadata?: Record<string, unknown>;
};

const SENSITIVE_KEY =
  /^(authorization|token|initdata|init_data|cookie|password|secret|bearer)$/i;
const SENSITIVE_SUBSTRING =
  /(authorization|token|initdata|init_data|cookie|password|secret|bearer)/i;

const DEFAULT_MAX_EVENTS = 8_000;
const POST_FAILURE_PRESERVE_MS = 10_000;

type RecorderGlobal = typeof globalThis & {
  __NOTIFICATIONS_PRODUCTION_RECORDER__?: NotificationsProductionRecorderApi;
  __NOTIFICATIONS_PRODUCTION_RECORDER_ENABLED__?: boolean;
  performance?: { now(): number };
};

function g(): RecorderGlobal {
  return globalThis as RecorderGlobal;
}

function nowMs(): number {
  const perf = g().performance;
  if (perf && typeof perf.now === 'function') return perf.now();
  return Date.now();
}

function wallClock(): string {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  return `${prefix}:${Math.random().toString(36).slice(2, 10)}:${Date.now().toString(36)}`;
}

/** Deep-sanitize for export — strip secrets / PII / ban text. */
export function sanitizeRecorderValue(value: unknown, keyHint = ''): unknown {
  if (value == null) return value;
  if (typeof value === 'string') {
    if (SENSITIVE_SUBSTRING.test(keyHint)) return '[redacted]';
    if (/^Bearer\s+/i.test(value)) return '[redacted-bearer]';
    if (keyHint === 'text' || keyHint === 'banText' || keyHint === 'message') {
      return `[text:${value.length}]`;
    }
    if (keyHint === 'username' || keyHint === 'firstName' || keyHint === 'lastName') {
      return '[redacted-name]';
    }
    if (/^https?:\/\//i.test(value)) {
      try {
        const u = new URL(value);
        u.search = '';
        u.hash = '';
        return u.toString();
      } catch {
        return value.split('?')[0] ?? value;
      }
    }
    return value;
  }
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((v, i) => sanitizeRecorderValue(v, String(i)));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(k) || SENSITIVE_SUBSTRING.test(k)) {
      out[k] = '[redacted]';
      continue;
    }
    out[k] = sanitizeRecorderValue(v, k);
  }
  return out;
}

export function sanitizeRecorderEvent(
  event: NotificationsRecorderEvent,
): NotificationsRecorderEvent {
  return {
    ...event,
    stateBefore: event.stateBefore
      ? (sanitizeRecorderValue(event.stateBefore) as Record<string, unknown>)
      : null,
    stateAfter: event.stateAfter
      ? (sanitizeRecorderValue(event.stateAfter) as Record<string, unknown>)
      : null,
    metadata: sanitizeRecorderValue(event.metadata) as Record<string, unknown>,
    error: event.error
      ? String(sanitizeRecorderValue(event.error, 'error'))
      : null,
    rejectionReason: event.rejectionReason
      ? String(sanitizeRecorderValue(event.rejectionReason, 'rejectionReason'))
      : null,
  };
}

export type NotificationsProductionRecorderApi = {
  start(): void;
  stop(): void;
  clear(): void;
  mark(label: string, data?: Record<string, unknown>): void;
  record(input: RecordEventInput): void;
  getTrace(): NotificationsRecorderTrace;
  exportTrace(): string;
  downloadTrace?(filename?: string): void;
  getSummary(): NotificationsRecorderSummary;
  isRunning(): boolean;
  /** Test/helpers — observe without enabling product behavior. */
  _setMaxEvents(n: number): void;
  _getRawEventCount(): number;
};

type CyclePhase =
  | 'idle'
  | 'open_pending'
  | 'open_succeeded'
  | 'close_pending'
  | 'failed';

function createRecorder(options?: {
  maxEvents?: number;
  appSessionId?: string;
  build?: NotificationsRecorderTrace['build'];
}): NotificationsProductionRecorderApi {
  let maxEvents = options?.maxEvents ?? DEFAULT_MAX_EVENTS;
  let running = false;
  let globalSeq = 0;
  let cycleNumber = 0;
  let successfulCycles = 0;
  let failedCycleNumber: number | null = null;
  let failureStage: string | null = null;
  let failureClass: NotificationsRecorderFailureClass | null = null;
  let openAttemptId: string | null = null;
  let closeAttemptId: string | null = null;
  let cyclePhase: CyclePhase = 'idle';
  let cycleOpenStartedAt: number | null = null;
  let failurePreserveUntil: number | null = null;
  let capacityReached = false;
  let lastOwner: string | null = null;
  let lastCapability: string | null = null;
  let lastActiveItemId: string | null = null;

  const appSessionId = options?.appSessionId ?? newId('app');
  let recorderSessionId = newId('rec');
  let startedAt = wallClock();
  const events: NotificationsRecorderEvent[] = [];

  const build: NotificationsRecorderTrace['build'] = options?.build ?? {
    gitSha:
      (typeof process !== 'undefined' &&
        (process.env.NEXT_PUBLIC_GIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA)) ||
      null,
    branch:
      (typeof process !== 'undefined' &&
        (process.env.NEXT_PUBLIC_GIT_BRANCH ??
          process.env.VERCEL_GIT_COMMIT_REF)) ||
      null,
    environment:
      (typeof process !== 'undefined' && process.env.NODE_ENV) || null,
    appVersion:
      (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_APP_VERSION) ||
      null,
  };

  function userAgentSummary(): string | null {
    try {
      const nav = (g() as { navigator?: { userAgent?: string } }).navigator;
      const ua = nav?.userAgent;
      if (!ua) return null;
      return ua.slice(0, 120);
    } catch {
      return null;
    }
  }

  function pushEvent(raw: NotificationsRecorderEvent): void {
    if (capacityReached && failurePreserveUntil != null) {
      // After capacity + failure window, only keep structural lifecycle.
      const structural = raw.stage.startsWith('CYCLE_') ||
        raw.stage === 'TRACE_CAPACITY_REACHED' ||
        raw.stage === 'RECORDER_STOPPED';
      if (!structural && nowMs() > failurePreserveUntil) return;
    }

    if (events.length >= maxEvents) {
      if (!capacityReached) {
        capacityReached = true;
        events.push({
          ...raw,
          globalSeq: ++globalSeq,
          stage: 'TRACE_CAPACITY_REACHED',
          eventName: 'TRACE_CAPACITY_REACHED',
          metadata: {
            ...raw.metadata,
            maxEvents,
            preservedNote:
              'ring drop oldest non-critical; failed cycle preserved when marked',
          },
        });
      }
      // Ring: drop oldest unless it belongs to last successful / failed cycle.
      while (events.length >= maxEvents) {
        const oldest = events[0];
        if (
          oldest &&
          failedCycleNumber != null &&
          (oldest.cycleNumber === failedCycleNumber ||
            oldest.cycleNumber === failedCycleNumber - 1)
        ) {
          break;
        }
        events.shift();
      }
    }
    events.push(raw);
  }

  function classifyFailure(meta: Record<string, unknown>): NotificationsRecorderFailureClass {
    const hint = String(meta.failureClass ?? meta.class ?? '');
    if (hint) return hint as NotificationsRecorderFailureClass;
    if (meta.openRejected) return 'OPEN_REJECTED';
    if (meta.owner === 'CREATE_BAN' || meta.finalOwner === 'CREATE_BAN') {
      return 'OWNER_DID_NOT_CHANGE';
    }
    if (meta.activeItemId == null && meta.expectedActive) {
      return 'RUNTIME_DID_NOT_ACTIVATE';
    }
    if (meta.viewPhase === 'EMPTY') return 'PRESENTER_EMPTY';
    if (meta.branch === 'CREATE_BAN') return 'APPLICATION_SURFACE_LOBBY';
    if (meta.stale) return 'STALE_EVENT_REVERTED_SESSION';
    if (meta.sync) return 'SYNC_REPLACED_STATE';
    if (meta.cardMounted === false) return 'REACT_DID_NOT_MOUNT_CARD';
    return 'UNKNOWN';
  }

  function record(input: RecordEventInput): void {
    if (!running) return;

    const stage = input.stage;
    const meta = { ...(input.metadata ?? {}) };

    // Cycle bookkeeping (observational).
    if (stage === 'LOBBY_YOUR_BANS_CLICK') {
      cycleNumber += 1;
      openAttemptId = newId('open');
      closeAttemptId = null;
      cyclePhase = 'open_pending';
      cycleOpenStartedAt = nowMs();
      pushEvent({
        globalSeq: ++globalSeq,
        monotonicTimeMs: nowMs(),
        wallClockTime: wallClock(),
        appSessionId,
        recorderSessionId,
        cycleNumber,
        openAttemptId,
        closeAttemptId: null,
        correlationId: input.correlationId ?? null,
        source: input.source,
        stage: 'CYCLE_STARTED',
        eventName: 'CYCLE_STARTED',
        stateBefore: null,
        stateAfter: null,
        result: null,
        rejectionReason: null,
        error: null,
        metadata: { cycleNumber },
      });
    }

    if (
      stage === 'NOTIFICATION_CARD_MOUNT' ||
      stage === 'NOTIFICATION_CARD_INSTANCE_CREATED'
    ) {
      if (cyclePhase === 'open_pending') {
        cyclePhase = 'open_succeeded';
        pushEvent({
          globalSeq: ++globalSeq,
          monotonicTimeMs: nowMs(),
          wallClockTime: wallClock(),
          appSessionId,
          recorderSessionId,
          cycleNumber,
          openAttemptId,
          closeAttemptId,
          correlationId: input.correlationId ?? null,
          source: 'recorder',
          stage: 'CYCLE_OPEN_SUCCEEDED',
          eventName: 'CYCLE_OPEN_SUCCEEDED',
          stateBefore: null,
          stateAfter: input.stateAfter ?? null,
          result: 'ok',
          rejectionReason: null,
          error: null,
          metadata: {},
        });
      }
    }

    if (
      stage === 'LOBBY_MOUNT' &&
      cyclePhase === 'close_pending'
    ) {
      cyclePhase = 'idle';
      successfulCycles += 1;
      pushEvent({
        globalSeq: ++globalSeq,
        monotonicTimeMs: nowMs(),
        wallClockTime: wallClock(),
        appSessionId,
        recorderSessionId,
        cycleNumber,
        openAttemptId,
        closeAttemptId,
        correlationId: input.correlationId ?? null,
        source: 'recorder',
        stage: 'CYCLE_CLOSE_SUCCEEDED',
        eventName: 'CYCLE_CLOSE_SUCCEEDED',
        stateBefore: null,
        stateAfter: null,
        result: 'ok',
        rejectionReason: null,
        error: null,
        metadata: { successfulCycles },
      });
    }

    if (
      stage === 'NOTIFICATION_CARD_CLOSE_CLICK' ||
      stage === 'RUNTIME_CLOSE_RECEIVED'
    ) {
      closeAttemptId = closeAttemptId ?? newId('close');
      if (cyclePhase === 'open_succeeded') cyclePhase = 'close_pending';
    }

    if (stage === 'COORDINATOR_OPEN_REJECTED') {
      markFailed(stage, classifyFailure({ openRejected: true, ...meta }), meta);
    }

    if (stage === 'APPLICATION_SURFACE_BRANCH_CREATE_BAN' && cyclePhase === 'open_pending') {
      // Still on Lobby after open attempt — may be failure; wait for threshold via mark.
      meta.branch = 'CREATE_BAN';
    }

    if (input.stateAfter) {
      if (typeof input.stateAfter.currentOwner === 'string') {
        lastOwner = input.stateAfter.currentOwner;
      }
      if (typeof input.stateAfter.capability === 'string') {
        lastCapability = input.stateAfter.capability;
      }
      if ('activeItemId' in input.stateAfter) {
        lastActiveItemId =
          input.stateAfter.activeItemId == null
            ? null
            : String(input.stateAfter.activeItemId);
      }
    }

    pushEvent({
      globalSeq: ++globalSeq,
      monotonicTimeMs: nowMs(),
      wallClockTime: wallClock(),
      appSessionId,
      recorderSessionId,
      cycleNumber,
      openAttemptId: input.openAttemptId ?? openAttemptId,
      closeAttemptId: input.closeAttemptId ?? closeAttemptId,
      correlationId: input.correlationId ?? null,
      source: input.source,
      stage,
      eventName: input.eventName ?? stage,
      stateBefore: input.stateBefore
        ? (sanitizeRecorderValue(input.stateBefore) as Record<string, unknown>)
        : null,
      stateAfter: input.stateAfter
        ? (sanitizeRecorderValue(input.stateAfter) as Record<string, unknown>)
        : null,
      result: input.result ?? null,
      rejectionReason: input.rejectionReason ?? null,
      error: input.error ?? null,
      metadata: sanitizeRecorderValue(meta) as Record<string, unknown>,
    });

    // Diagnostic failure threshold — observational only.
    if (
      cyclePhase === 'open_pending' &&
      cycleOpenStartedAt != null &&
      nowMs() - cycleOpenStartedAt >= CYCLE_OPEN_DIAGNOSTIC_THRESHOLD_MS &&
      failedCycleNumber == null
    ) {
      markFailed(
        'CYCLE_FAILED',
        'UNKNOWN',
        {
          reason: 'diagnostic_threshold',
          thresholdMs: CYCLE_OPEN_DIAGNOSTIC_THRESHOLD_MS,
        },
      );
    }
  }

  function markFailed(
    stage: string,
    klass: NotificationsRecorderFailureClass,
    meta: Record<string, unknown>,
  ): void {
    if (failedCycleNumber != null) return;
    if (cycleNumber <= 0) return;
    failedCycleNumber = cycleNumber;
    failureStage = stage;
    failureClass = klass;
    cyclePhase = 'failed';
    failurePreserveUntil = nowMs() + POST_FAILURE_PRESERVE_MS;
    pushEvent({
      globalSeq: ++globalSeq,
      monotonicTimeMs: nowMs(),
      wallClockTime: wallClock(),
      appSessionId,
      recorderSessionId,
      cycleNumber,
      openAttemptId,
      closeAttemptId,
      correlationId: null,
      source: 'recorder',
      stage: 'CYCLE_FAILED',
      eventName: 'CYCLE_FAILED',
      stateBefore: null,
      stateAfter: null,
      result: 'failed',
      rejectionReason: klass,
      error: null,
      metadata: sanitizeRecorderValue(meta) as Record<string, unknown>,
    });
    pushEvent({
      globalSeq: ++globalSeq,
      monotonicTimeMs: nowMs(),
      wallClockTime: wallClock(),
      appSessionId,
      recorderSessionId,
      cycleNumber,
      openAttemptId,
      closeAttemptId,
      correlationId: null,
      source: 'recorder',
      stage: 'CYCLE_FAILURE_CLASSIFIED',
      eventName: 'CYCLE_FAILURE_CLASSIFIED',
      stateBefore: null,
      stateAfter: null,
      result: klass,
      rejectionReason: klass,
      error: null,
      metadata: { failureClass: klass, failureStage: stage },
    });
  }

  const api: NotificationsProductionRecorderApi = {
    start() {
      if (running) return;
      running = true;
      recorderSessionId = newId('rec');
      startedAt = wallClock();
      record({
        source: 'recorder',
        stage: 'RECORDER_STARTED',
        metadata: { recorderSessionId },
      });
    },

    stop() {
      if (!running) return;
      record({
        source: 'recorder',
        stage: 'RECORDER_STOPPED',
        metadata: { eventCount: events.length },
      });
      running = false;
    },

    clear() {
      events.length = 0;
      globalSeq = 0;
      cycleNumber = 0;
      successfulCycles = 0;
      failedCycleNumber = null;
      failureStage = null;
      failureClass = null;
      openAttemptId = null;
      closeAttemptId = null;
      cyclePhase = 'idle';
      cycleOpenStartedAt = null;
      failurePreserveUntil = null;
      capacityReached = false;
      lastOwner = null;
      lastCapability = null;
      lastActiveItemId = null;
      recorderSessionId = newId('rec');
      startedAt = wallClock();
    },

    mark(label, data) {
      record({
        source: 'manual',
        stage: 'RECORDER_MARK',
        eventName: label,
        metadata: data ?? {},
      });
    },

    record,

    getTrace() {
      return {
        schemaVersion: NOTIFICATIONS_PRODUCTION_RECORDER_SCHEMA_VERSION,
        build: { ...build },
        session: {
          appSessionId,
          recorderSessionId,
          startedAt,
          userAgentSummary: userAgentSummary(),
          telegramEnvironment: null,
        },
        summary: {
          successfulCycles,
          failedCycleNumber,
          failureStage,
          failureClass,
          finalOwner: lastOwner,
          finalCapability: lastCapability,
          finalActiveItemId: lastActiveItemId,
        },
        events: events.map(sanitizeRecorderEvent),
      };
    },

    exportTrace() {
      return JSON.stringify(api.getTrace(), null, 2);
    },

    downloadTrace(filename) {
      const json = api.exportTrace();
      if (typeof document === 'undefined') return;
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        filename ??
        `notifications-production-trace-${recorderSessionId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },

    getSummary() {
      return {
        running,
        eventCount: events.length,
        capacity: maxEvents,
        lastStage: events.length ? events[events.length - 1]!.stage : null,
        successfulCycles,
        failedCycleNumber,
        failureStage,
        failureClass,
        finalOwner: lastOwner,
        finalCapability: lastCapability,
        finalActiveItemId: lastActiveItemId,
      };
    },

    isRunning() {
      return running;
    },

    _setMaxEvents(n: number) {
      maxEvents = Math.max(16, Math.floor(n));
    },

    _getRawEventCount() {
      return events.length;
    },
  };

  return api;
}

let singleton: NotificationsProductionRecorderApi | null = null;

export function createNotificationsProductionRecorder(options?: {
  maxEvents?: number;
  appSessionId?: string;
  build?: NotificationsRecorderTrace['build'];
}): NotificationsProductionRecorderApi {
  return createRecorder(options);
}

export function getNotificationsProductionRecorder(): NotificationsProductionRecorderApi {
  if (!singleton) {
    singleton = createRecorder();
    installRecorderGlobal(singleton);
  }
  return singleton;
}

export function resetNotificationsProductionRecorderForTests(): void {
  singleton = null;
  const glob = g();
  delete glob.__NOTIFICATIONS_PRODUCTION_RECORDER__;
}

export function installRecorderGlobal(
  api: NotificationsProductionRecorderApi = getNotificationsProductionRecorder(),
): void {
  g().__NOTIFICATIONS_PRODUCTION_RECORDER__ = api;
}

/** No-op when recorder is not running — safe at call sites. */
export function recordNotificationsProductionEvent(
  input: RecordEventInput,
): void {
  const api = g().__NOTIFICATIONS_PRODUCTION_RECORDER__;
  if (!api || !api.isRunning()) return;
  api.record(input);
}

export function isNotificationsProductionRecorderRunning(): boolean {
  const api = g().__NOTIFICATIONS_PRODUCTION_RECORDER__;
  return Boolean(api?.isRunning());
}
