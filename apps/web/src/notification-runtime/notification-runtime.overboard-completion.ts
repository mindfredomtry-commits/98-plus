/**
 * Stage 8 Phase 8 — overboard completion diagnostics (Sync V1 state).
 */
import type { NotificationRuntimeState } from './notification-runtime.types';

export function getIncomingOverboardCompletionSnapshot(
  state: NotificationRuntimeState,
): {
  syncStatus: string;
  activeItemId: string | null;
  passiveCount: number;
} {
  return {
    syncStatus: state.syncStatus,
    activeItemId: state.activeItemId,
    passiveCount: state.passiveItemIds.length,
  };
}

export function explainIncomingOverboardCompletion(
  before: NotificationRuntimeState,
  after: NotificationRuntimeState,
): string {
  if (after.activeItemId && after.activeItemId !== before.activeItemId) {
    return 'causal-or-active-changed';
  }
  if (before.activeItemId && !after.activeItemId) {
    return 'active-cleared';
  }
  return 'unchanged';
}

export function noteIncomingOverboardCompletion(_args: unknown): void {
  // no-op diagnostic hook
}
