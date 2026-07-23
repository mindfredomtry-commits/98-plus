/**
 * TEMP diagnostics for new-live queue presentation vs product surface.
 * Safe fields only — no secrets.
 */

export type QueuePresentationDiagEvent =
  | 'QUEUE_SURFACE_CHECK'
  | 'QUEUE_MATERIALIZE_ALLOWED'
  | 'QUEUE_MATERIALIZE_BLOCKED'
  | 'PENDING_PREFETCH_START'
  | 'PENDING_PREFETCH_RESOLVE';

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
