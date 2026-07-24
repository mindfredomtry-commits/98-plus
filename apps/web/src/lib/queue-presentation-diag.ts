/**
 * TEMP diagnostics for new-live queue presentation vs product surface.
 * Safe fields only — no secrets.
 *
 * Must not import notification-runtime (contract: lib stays free of runtime).
 * Callers pass already-sanitized snapshots.
 */

/** Six-point SUCCESS trace event names (production verification pass). */
export type SuccessTraceEvent =
  | 'SUCCESS_EXIT'
  | 'SUCCESS_HANDOFF_START'
  | 'SUCCESS_HANDOFF_RESULT'
  | 'MATERIALIZE_RESULT'
  | 'RUNTIME_STATE_AFTER_SUCCESS'
  | 'LOBBY_CHROME_DECISION';

/** Emit one sanitized SUCCESS trace line (console + optional debug sink). */
export function logSuccessTrace(
  event: SuccessTraceEvent,
  snapshot: Record<string, unknown>,
): void {
  console.log(event, snapshot);
  if (typeof window !== 'undefined') {
    window.__debug98log?.(event, snapshot);
  }
}

export type QueuePresentationDiagEvent =
  | 'QUEUE_SURFACE_CHECK'
  | 'QUEUE_MATERIALIZE_ALLOWED'
  | 'QUEUE_MATERIALIZE_BLOCKED'
  | 'PENDING_PREFETCH_START'
  | 'PENDING_PREFETCH_RESOLVE'
  | 'BANS_NAV_CLICK'
  | 'BANS_SECTION_STATE_SET'
  | 'BANS_PREFETCH_START'
  | 'BANS_PREFETCH_RESOLVE'
  | 'SUCCESS_CONTINUE_REQUESTED'
  | 'SUCCESS_CONTINUE_BLOCKED'
  | 'SUCCESS_SHOW_HEAD'
  | 'SUCCESS_QUEUE_SNAPSHOT'
  | 'SUCCESS_RUNTIME_NORMALIZED'
  | 'PENDING_AUTHORITY_UPDATE'
  | 'LOBBY_CHROME_DECISION';

export type QueuePresentationDiagFields = {
  runtimeLifecycle?: string | null;
  surface?: string | null;
  mode?: string | null;
  transitionId?: string | null;
  overlayPermitted?: boolean;
  blockingReason?: string | null;
  elapsedMs?: number | null;
  source?: string | null;
  pendingCount?: number | null;
  itemCount?: number | null;
  queueLength?: number | null;
  presentationIntent?: string | null;
  displayKind?: string | null;
  /** Request-start pending authority generation (out-of-order diagnosis). */
  requestGeneration?: number | null;
  chainTransitioning?: boolean;
  startupHold?: boolean;
  lobbyOpen?: boolean;
  chromeAllowed?: boolean;
};

const SECRET_KEYS = new Set([
  'initdata',
  'init_data',
  'jwt',
  'authorization',
  'token',
  'password',
  'cookie',
  'bot_token',
  'hash',
]);

function sanitize(
  fields: QueuePresentationDiagFields,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (SECRET_KEYS.has(key.toLowerCase())) continue;
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}

/** Always-on TEMP console (filter by event name in production smoke). */
export function logQueuePresentation(
  event: QueuePresentationDiagEvent,
  fields: QueuePresentationDiagFields = {},
): void {
  const payload = sanitize(fields);
  console.log(event, payload);
  if (typeof window !== 'undefined') {
    window.__debug98log?.(event, payload);
  }
}
