import type { WsStatus } from '@/hooks/useWebSocket';

/** No scary offline UI during initial cache-first paint + reconnect. */
export const STARTUP_GRACE_MS = 4000;

export type ConnectionUiState = 'hidden' | 'offline';

export function resolveConnectionUiState(input: {
  wsStatus: WsStatus;
  startupGraceActive: boolean;
  networkBootstrapCompleted: boolean;
  hasSuccessfulNetworkSync: boolean;
  wsHasConnectedOnce: boolean;
  navigatorOffline: boolean;
}): ConnectionUiState {
  if (input.startupGraceActive) return 'hidden';
  if (!input.networkBootstrapCompleted) return 'hidden';
  if (input.wsStatus === 'connected' || input.wsStatus === 'skipped') {
    return 'hidden';
  }
  // Reconnecting is not offline — silent until we know the link is dead.
  if (input.wsStatus === 'connecting') return 'hidden';

  if (input.navigatorOffline) return 'offline';

  if (input.wsStatus === 'disconnected') {
    if (!input.hasSuccessfulNetworkSync) return 'offline';
    if (input.wsHasConnectedOnce) return 'offline';
    return 'hidden';
  }

  return 'hidden';
}
