/** Unified startup timeline — grep console for `[startup]`. */

let bootGeneration = 0;
let t0 = 0;

export function resetStartupTimeline(): number {
  bootGeneration += 1;
  t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  logStartup('BOOT_RESET', { generation: bootGeneration });
  return bootGeneration;
}

export function currentBootGeneration(): number {
  return bootGeneration;
}

export function logStartup(
  phase:
    | 'BOOT_RESET'
    | 'AUTH_READY'
    | 'SESSION_FETCH_START'
    | 'SESSION_FETCH_DONE'
    | 'SESSION_APPLY_SKIP'
    | 'INCOMING_FOUND'
    | 'CHECK_FOUND'
    | 'AVATAR_PRELOAD_START'
    | 'AVATAR_PRELOAD_DONE'
    | 'ARENA_READY'
    | 'ARENA_RENDER',
  payload: Record<string, unknown> = {},
) {
  const now =
    typeof performance !== 'undefined' ? performance.now() : Date.now();
  const elapsedMs = t0 ? Math.round(now - t0) : 0;
  console.log('[startup]', {
    phase,
    generation: bootGeneration,
    elapsedMs,
    ...payload,
    at: Date.now(),
  });
}
