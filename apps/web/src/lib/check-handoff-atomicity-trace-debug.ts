'use client';

/**
 * CHECK_HANDOFF_ATOMICITY_TRACE
 *
 * Read-only diagnostic trace that stitches together every event of a single
 * Check-Card → next-card handoff under one shared `handoffTraceId`.
 *
 * This module NEVER changes business logic, timers, guards, queue consume,
 * render priority or lobby visibility. It only records the order of events
 * between releasing the current Check and the next card appearing (or the
 * lobby appearing in the gap).
 *
 * handoffTraceId format: `check-handoff:<banId>:<timestamp>`.
 */

import { diagTraceNow, emitClientDiagTrace } from './diag-trace-client';

const TRACE_EVENT = 'CHECK_HANDOFF_ATOMICITY_TRACE';

/**
 * Persistence layer for CHECK_HANDOFF_ATOMICITY_TRACE.
 *
 * Telegram Mini App DevTools fully close/reconnect while the bug reproduces, so
 * a normal `console.log` is lost even with Preserve log enabled. To keep the
 * previous handoff around across a full reload/reconnect we mirror every emitted
 * trace event into a small ring buffer in localStorage and replay it on the next
 * client start.
 *
 * This is diagnostics-only: no business logic, timers, queue, consume/dequeue,
 * render priority, guards, polling or intervals are touched.
 */
const TRACE_BUFFER_STORAGE_KEY = '98plus:check-handoff-trace-buffer:v1';
const TRACE_BUFFER_MAX_ENTRIES = 200;
const TRACE_RESTORED_EVENT = 'CHECK_HANDOFF_ATOMICITY_TRACE_RESTORED';
const TRACE_RESTORED_ENTRY_EVENT = 'CHECK_HANDOFF_ATOMICITY_TRACE_RESTORED_ENTRY';

type PersistedTraceEntry = {
  savedAt: number;
  handoffTraceId: string;
  stage: string;
  payload: unknown;
};

/** One-shot guard for the current page lifecycle. Reset naturally on a real
 * reload because the module is re-evaluated. */
let traceBufferRestored = false;

/** Safe deep copy that produces a JSON-serializable value. Functions, DOM
 * nodes, Error instances and circular references are replaced with strings (or
 * dropped) so that neither JSON.stringify nor the app can ever throw. */
function sanitizeForTraceBuffer(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null) return null;
  const t = typeof value;
  if (t === 'string' || t === 'boolean') return value;
  if (t === 'number') return Number.isFinite(value as number) ? value : String(value);
  if (t === 'bigint') return String(value);
  if (t === 'undefined' || t === 'function' || t === 'symbol') return undefined;

  if (value instanceof Error) {
    return `[Error: ${value.name}: ${value.message}]`;
  }

  // DOM nodes / window / other host objects.
  if (
    typeof Node !== 'undefined' &&
    value instanceof Node
  ) {
    return '[DOMNode]';
  }
  if (typeof window !== 'undefined' && value === window) {
    return '[Window]';
  }

  if (t === 'object') {
    const obj = value as object;
    if (seen.has(obj)) return '[Circular]';
    seen.add(obj);
    try {
      if (Array.isArray(value)) {
        return value.map((item) => {
          const sanitized = sanitizeForTraceBuffer(item, seen);
          return sanitized === undefined ? null : sanitized;
        });
      }
      if (value instanceof Map || value instanceof Set) {
        return String(value);
      }
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(obj as Record<string, unknown>)) {
        let sanitized: unknown;
        try {
          sanitized = sanitizeForTraceBuffer(
            (obj as Record<string, unknown>)[key],
            seen,
          );
        } catch {
          // Skip only this field if it cannot be sanitized.
          sanitized = undefined;
        }
        if (sanitized !== undefined) out[key] = sanitized;
      }
      return out;
    } finally {
      seen.delete(obj);
    }
  }

  // Fallback for anything unexpected.
  try {
    return String(value);
  } catch {
    return '[Unserializable]';
  }
}

function readPersistedTraceBuffer(): PersistedTraceEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(TRACE_BUFFER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as PersistedTraceEntry[];
  } catch {
    return [];
  }
}

function appendToPersistedTraceBuffer(
  handoffTraceId: string,
  stage: string,
  payload: Record<string, unknown>,
): void {
  if (typeof window === 'undefined') return;
  try {
    const entry: PersistedTraceEntry = {
      savedAt: Date.now(),
      handoffTraceId,
      stage,
      payload: sanitizeForTraceBuffer(payload, new WeakSet<object>()),
    };
    const buffer = readPersistedTraceBuffer();
    buffer.push(entry);
    // Ring buffer: keep only the newest TRACE_BUFFER_MAX_ENTRIES events.
    const trimmed =
      buffer.length > TRACE_BUFFER_MAX_ENTRIES
        ? buffer.slice(buffer.length - TRACE_BUFFER_MAX_ENTRIES)
        : buffer;
    window.localStorage.setItem(
      TRACE_BUFFER_STORAGE_KEY,
      JSON.stringify(trimmed),
    );
  } catch {
    // localStorage unavailable, quota exceeded, serialization failure, SSR, etc.
    // Diagnostics must never break the app — silently continue.
  }
}

/**
 * Replay the persisted handoff trace buffer once per page lifecycle. Emits one
 * summary header (CHECK_HANDOFF_ATOMICITY_TRACE_RESTORED) followed by one entry
 * per saved record (CHECK_HANDOFF_ATOMICITY_TRACE_RESTORED_ENTRY).
 *
 * Restored records are NOT re-emitted as CHECK_HANDOFF_ATOMICITY_TRACE, so they
 * are never re-buffered and cannot create duplicates. The buffer is intentionally
 * left in place (not cleared) so the user can reopen a lost console and still
 * find the previous handoff.
 */
export function restorePersistedCheckHandoffTraceBuffer(): void {
  if (typeof window === 'undefined') return;
  if (traceBufferRestored) return;
  traceBufferRestored = true;

  let buffer: PersistedTraceEntry[] = [];
  try {
    buffer = readPersistedTraceBuffer();
  } catch {
    return;
  }
  if (!buffer.length) return;

  try {
    const savedAts = buffer
      .map((e) => e?.savedAt)
      .filter((v): v is number => typeof v === 'number');
    const handoffTraceIds = Array.from(
      new Set(
        buffer
          .map((e) => e?.handoffTraceId)
          .filter((v): v is string => typeof v === 'string'),
      ),
    );
    emitClientDiagTrace(TRACE_RESTORED_EVENT, {
      restoredCount: buffer.length,
      firstSavedAt: savedAts.length ? savedAts[0] : null,
      lastSavedAt: savedAts.length ? savedAts[savedAts.length - 1] : null,
      handoffTraceIds,
    });
    for (const entry of buffer) {
      emitClientDiagTrace(TRACE_RESTORED_ENTRY_EVENT, {
        restored: true,
        savedAt: entry?.savedAt ?? null,
        handoffTraceId: entry?.handoffTraceId ?? null,
        stage: entry?.stage ?? null,
        payload: entry?.payload ?? null,
      });
    }
  } catch {
    // Never let diagnostics break client start.
  }
}

/** Manually delete the persisted trace buffer. Never called automatically. */
export function clearPersistedCheckHandoffTraceBuffer(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(TRACE_BUFFER_STORAGE_KEY);
  } catch {
    // Ignore — nothing to clean up safely.
  }
}

// Dev/browser convenience: expose the manual clear helper without touching the
// project's global Window types (cast avoids adding a global declaration).
if (typeof window !== 'undefined') {
  try {
    (window as unknown as Record<string, unknown>)[
      '__CLEAR_CHECK_HANDOFF_TRACE_BUFFER__'
    ] = clearPersistedCheckHandoffTraceBuffer;
  } catch {
    // Ignore if the global is frozen / not assignable.
  }
}

export type CheckHandoffOutcome =
  | 'next-card-committed'
  | 'queue-confirmed-empty'
  | 'open-lobby'
  | 'retry-exhausted'
  | 'handoff-aborted';

type CheckHandoffState = {
  id: string;
  banId: string;
  startedAt: number;
  prefetchStartedAt: number | null;
  prefetchStarted: boolean;
  prefetchSettled: boolean;
  nextCardCommitted: boolean;
  retryAttempt: number;
  lastStage: string | null;
  outcome: CheckHandoffOutcome | null;
  finalized: boolean;
  fetchedIdentities: string[];
};

/** Single active handoff. Kept until the next handoff begins so that the
 * post-commit render/transition observers (stages 11-13) can still attach the
 * correct id right after a final outcome. */
let active: CheckHandoffState | null = null;

/** Dedup keys: `${id}::${stage}::${dedupKey}`. */
const emittedKeys = new Set<string>();

/** InstantBanFlow-computed values mirrored for Providers-side stages. Written
 * during render (read-only mirror, no logging, no logic). */
type RenderMirror = {
  showLobbyCta: boolean | null;
  queueClaimsNotificationScreen: boolean | null;
  effectiveBansOverlayOpen: boolean | null;
  notificationQueueUiLock: boolean | null;
  effectiveOverlayQueueLengthForLobbyCta: number | null;
  queueLobbyGuardActive: boolean | null;
};

let renderMirror: RenderMirror = {
  showLobbyCta: null,
  queueClaimsNotificationScreen: null,
  effectiveBansOverlayOpen: null,
  notificationQueueUiLock: null,
  effectiveOverlayQueueLengthForLobbyCta: null,
  queueLobbyGuardActive: null,
};

export function updateCheckHandoffRenderMirror(patch: Partial<RenderMirror>): void {
  renderMirror = { ...renderMirror, ...patch };
}

export function getCheckHandoffRenderMirror(): Readonly<RenderMirror> {
  return renderMirror;
}

/** Providers-only values mirrored so the InstantBanFlow render observer (stage
 * 11) can report the shell/overlay mount-arm state of the same frame. */
type ProvidersMirror = {
  ownerDisplayKind: string | null;
  chainAdvancePlaceholderKind: string | null;
  checkOverlayMounted: boolean | null;
  showCheckOverlayDirect: boolean | null;
  ownerPrimaryCheckBanForDisplayGuardsId: string | null;
  notificationChainTransitioning: boolean | null;
  ownerQueueLength: number | null;
  ownerPendingLength: number | null;
  currentQueueHeadKind: string | null;
  currentQueueHeadIdentity: string | null;
  notificationQueueShellKind: string | null;
};

let providersMirror: ProvidersMirror = {
  ownerDisplayKind: null,
  chainAdvancePlaceholderKind: null,
  checkOverlayMounted: null,
  showCheckOverlayDirect: null,
  ownerPrimaryCheckBanForDisplayGuardsId: null,
  notificationChainTransitioning: null,
  ownerQueueLength: null,
  ownerPendingLength: null,
  currentQueueHeadKind: null,
  currentQueueHeadIdentity: null,
  notificationQueueShellKind: null,
};

export function updateCheckHandoffProvidersMirror(
  patch: Partial<ProvidersMirror>,
): void {
  providersMirror = { ...providersMirror, ...patch };
}

export function getCheckHandoffProvidersMirror(): Readonly<ProvidersMirror> {
  return providersMirror;
}

export function getActiveCheckHandoffTraceId(): string | null {
  return active?.id ?? null;
}

export function getActiveCheckHandoffState(): Readonly<CheckHandoffState> | null {
  return active;
}

export function checkHandoffElapsedFromStartMs(): number | null {
  if (!active) return null;
  return Math.round(diagTraceNow() - active.startedAt);
}

export function checkHandoffElapsedFromPrefetchMs(): number | null {
  if (!active || active.prefetchStartedAt == null) return null;
  return Math.round(diagTraceNow() - active.prefetchStartedAt);
}

/** Begin a new handoff trace at the moment the Check answer is accepted. Aborts
 * any previous still-unfinalized handoff. Returns the new handoffTraceId. */
export function beginCheckHandoffTrace(banId: string | null | undefined): string {
  if (active && !active.finalized) {
    // Previous handoff never reached a terminal outcome — record abort.
    emitCheckHandoffStage('handoff-aborted', {
      previousBanId: active.banId,
      abortedByNewHandoff: true,
      lastHandoffStage: active.lastStage,
    });
    active.outcome = 'handoff-aborted';
    active.finalized = true;
  }
  const normalizedBanId = (banId ?? '').trim() || 'unknown';
  const id = `check-handoff:${normalizedBanId}:${Date.now()}`;
  active = {
    id,
    banId: normalizedBanId,
    startedAt: diagTraceNow(),
    prefetchStartedAt: null,
    prefetchStarted: false,
    prefetchSettled: false,
    nextCardCommitted: false,
    retryAttempt: 0,
    lastStage: null,
    outcome: null,
    finalized: false,
    fetchedIdentities: [],
  };
  emittedKeys.clear();
  return id;
}

export function setCheckHandoffFetchedIdentities(identities: string[]): void {
  if (!active) return;
  active.fetchedIdentities = identities;
}

export function getCheckHandoffFetchedIdentities(): string[] {
  return active?.fetchedIdentities ?? [];
}

export function markCheckHandoffPrefetchStarted(): void {
  if (!active) return;
  active.prefetchStarted = true;
  if (active.prefetchStartedAt == null) {
    active.prefetchStartedAt = diagTraceNow();
  }
}

export function markCheckHandoffPrefetchSettled(): void {
  if (!active) return;
  active.prefetchSettled = true;
}

export function markCheckHandoffNextCardCommitted(): void {
  if (!active) return;
  active.nextCardCommitted = true;
}

export function setCheckHandoffRetryAttempt(attempt: number): void {
  if (!active) return;
  active.retryAttempt = attempt;
}

export function getCheckHandoffFlags(): {
  prefetchStarted: boolean;
  prefetchSettled: boolean;
  nextCardCommitted: boolean;
  retryAttempt: number;
  lastHandoffStage: string | null;
} {
  return {
    prefetchStarted: active?.prefetchStarted ?? false,
    prefetchSettled: active?.prefetchSettled ?? false,
    nextCardCommitted: active?.nextCardCommitted ?? false,
    retryAttempt: active?.retryAttempt ?? 0,
    lastHandoffStage: active?.lastStage ?? null,
  };
}

/** Mark a terminal outcome without clearing the active handoff (so post-commit
 * observers can still attach the id). The handoff is replaced on the next
 * `beginCheckHandoffTrace`. */
export function markCheckHandoffOutcome(outcome: CheckHandoffOutcome): void {
  if (!active) return;
  active.outcome = outcome;
  active.finalized = true;
}

/**
 * Emit one CHECK_HANDOFF_ATOMICITY_TRACE event, deduplicated by
 * `handoffTraceId + stage + dedupKey`. No-op when there is no active handoff.
 */
export function emitCheckHandoffStage(
  stage: string,
  fields: Record<string, unknown>,
  dedupKey?: string,
): void {
  if (!active) return;
  const key = `${active.id}::${stage}::${dedupKey ?? ''}`;
  if (emittedKeys.has(key)) return;
  emittedKeys.add(key);
  active.lastStage = stage;
  const payload: Record<string, unknown> = {
    handoffTraceId: active.id,
    stage,
    t: diagTraceNow(),
    ...fields,
  };
  // Persist first (best-effort) so the previous handoff survives a full
  // reload/reconnect, then continue the existing console/debug emit.
  appendToPersistedTraceBuffer(active.id, stage, payload);
  emitClientDiagTrace(TRACE_EVENT, payload);
}
