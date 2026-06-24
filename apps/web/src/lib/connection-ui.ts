import type { WsStatus } from '@/hooks/useWebSocket';
import {
  explainConnectionUiState,
  type ConnectionUiResolveInput,
} from '@/lib/connection-state-debug';

/** No scary offline UI during initial cache-first paint + reconnect. */
export const STARTUP_GRACE_MS = 4000;

export type ConnectionUiState = 'hidden' | 'offline';

export function resolveConnectionUiState(
  input: ConnectionUiResolveInput,
): ConnectionUiState {
  return explainConnectionUiState(input).state;
}

export { explainConnectionUiState, type ConnectionUiResolveInput };
