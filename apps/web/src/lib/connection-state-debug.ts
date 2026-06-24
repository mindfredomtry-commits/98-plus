'use client';

import type { ConnectionUiState } from '@/lib/connection-ui';
import type { WsStatus } from '@/hooks/useWebSocket';

export type ConnectionFetchSnapshot = {
  endpoint: string | null;
  source: string | null;
  lastFetchStatus: number | 'ok' | 'network' | 'timeout' | null;
  lastFetchError: string | null;
  lastFetchAt: number | null;
};

let lastFetch: ConnectionFetchSnapshot = {
  endpoint: null,
  source: null,
  lastFetchStatus: null,
  lastFetchError: null,
  lastFetchAt: null,
};

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function getConnectionFetchSnapshot(): ConnectionFetchSnapshot {
  return { ...lastFetch };
}

export function noteConnectionFetchStart(data: {
  endpoint: string;
  source?: string;
}): void {
  lastFetch = {
    ...lastFetch,
    endpoint: data.endpoint,
    source: data.source ?? lastFetch.source,
    lastFetchAt: performance.now(),
  };
}

export function patchConnectionFetchOutcome(data: {
  endpoint: string;
  ok: boolean;
  status?: number;
  error?: string;
  source?: string;
}): void {
  lastFetch = {
    endpoint: data.endpoint,
    source: data.source ?? lastFetch.source,
    lastFetchStatus: data.ok
      ? 'ok'
      : data.status != null
        ? data.status
        : data.error?.toLowerCase().includes('timeout')
          ? 'timeout'
          : 'network',
    lastFetchError: data.ok ? null : (data.error ?? 'unknown'),
    lastFetchAt: performance.now(),
  };
}

export type ConnectionUiResolveInput = {
  wsStatus: WsStatus;
  startupGraceActive: boolean;
  networkBootstrapCompleted: boolean;
  hasSuccessfulNetworkSync: boolean;
  wsHasConnectedOnce: boolean;
  navigatorOffline: boolean;
};

export function explainConnectionUiState(input: ConnectionUiResolveInput): {
  state: ConnectionUiState;
  reason: string;
} {
  if (input.startupGraceActive) {
    return { state: 'hidden', reason: 'startup-grace' };
  }
  if (!input.networkBootstrapCompleted) {
    return { state: 'hidden', reason: 'bootstrap-incomplete' };
  }
  if (input.wsStatus === 'connected' || input.wsStatus === 'skipped') {
    return { state: 'hidden', reason: `ws-${input.wsStatus}` };
  }
  if (input.wsStatus === 'connecting') {
    return { state: 'hidden', reason: 'ws-connecting' };
  }
  if (input.navigatorOffline) {
    return { state: 'offline', reason: 'navigator-offline' };
  }
  if (input.wsStatus === 'disconnected') {
    if (!input.hasSuccessfulNetworkSync) {
      return { state: 'offline', reason: 'ws-disconnected-no-successful-sync' };
    }
    if (input.wsHasConnectedOnce) {
      return { state: 'offline', reason: 'ws-disconnected-after-connected' };
    }
    return { state: 'hidden', reason: 'ws-disconnected-never-connected' };
  }
  return { state: 'hidden', reason: 'default-hidden' };
}

export type ConnectionFallbackGuardSnapshot = {
  activeKind: string | null;
  hasVisibleUserCardOverlay: boolean;
  overlayQueueLen: number;
  pendingLen: number;
};

export function shouldSuppressFullConnectionFallback(
  snap: ConnectionFallbackGuardSnapshot,
): boolean {
  if (snap.hasVisibleUserCardOverlay && snap.activeKind) return true;
  if (
    snap.hasVisibleUserCardOverlay &&
    (snap.overlayQueueLen > 0 || snap.pendingLen > 0)
  ) {
    return true;
  }
  return false;
}

export function logConnectionStateChange(data: Record<string, unknown>): void {
  emit('[CONNECTION STATE CHANGE]', data);
}
