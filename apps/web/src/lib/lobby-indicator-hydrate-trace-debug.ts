'use client';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export type LobbyIndicatorHydrateUpdateSource =
  | 'bootstrap'
  | 'websocket'
  | 'polling'
  | 'api'
  | 'hydrate'
  | 'mirror'
  | 'unknown';

export type LobbyIndicatorHydrateTracePayload = {
  /** performance.now() at emit time */
  t: number;
  pendingOverlaysCount: number;
  queueLength: number;
  ownerDisplayKind: string | null;
  ownerQueueHead: { kind: string; banId: string | null } | null;
  updateSource: LobbyIndicatorHydrateUpdateSource;
  lobbyBansAttentionHint?: number;
  sessionBootstrapped?: boolean;
  pendingStartupInteractionsCount?: number;
  [key: string]: unknown;
};

export function buildLobbyIndicatorHydrateTracePayload(
  updateSource: LobbyIndicatorHydrateUpdateSource,
  snapshot: Omit<
    LobbyIndicatorHydrateTracePayload,
    't' | 'updateSource'
  >,
  extra?: Record<string, unknown>,
): LobbyIndicatorHydrateTracePayload {
  return {
    t: typeof performance !== 'undefined' ? performance.now() : 0,
    updateSource,
    ...snapshot,
    ...extra,
  };
}

function trace(
  tag: string,
  payload: LobbyIndicatorHydrateTracePayload,
): void {
  emit(tag, payload);
}

export function logAppBootHydrateTrace(
  payload: LobbyIndicatorHydrateTracePayload,
): void {
  trace('[APP BOOT]', payload);
}

export function logLobbyMountHydrateTrace(
  payload: LobbyIndicatorHydrateTracePayload,
): void {
  trace('[LOBBY MOUNT]', payload);
}

export function logQueueHydrateStartTrace(
  payload: LobbyIndicatorHydrateTracePayload,
): void {
  trace('[QUEUE HYDRATE START]', payload);
}

export function logQueueHydrateEndTrace(
  payload: LobbyIndicatorHydrateTracePayload,
): void {
  trace('[QUEUE HYDRATE END]', payload);
}

export function logOwnerQueueUpdatedHydrateTrace(
  payload: LobbyIndicatorHydrateTracePayload,
): void {
  trace('[OWNER QUEUE UPDATED]', payload);
}

export function logOwnerDisplayUpdatedHydrateTrace(
  payload: LobbyIndicatorHydrateTracePayload,
): void {
  trace('[OWNER DISPLAY UPDATED]', payload);
}

export function logLobbyIndicatorComputeHydrateTrace(
  payload: LobbyIndicatorHydrateTracePayload,
): void {
  trace('[LOBBY INDICATOR COMPUTE]', payload);
}

export function logLobbyIndicatorRenderHydrateTrace(
  payload: LobbyIndicatorHydrateTracePayload,
): void {
  trace('[LOBBY INDICATOR RENDER]', payload);
}
