/**
 * Stage 8 Phase 8 — stale replace guard retired (reconcile owns authority).
 */
import type { NotificationRuntimeState } from './notification-runtime.types';

export function decideStaleReplaceGuard(_args: {
  state: NotificationRuntimeState;
  transitionId?: string | null;
}): { allow: true } {
  return { allow: true };
}
