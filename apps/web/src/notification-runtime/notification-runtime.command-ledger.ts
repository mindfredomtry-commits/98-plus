/**
 * Stage 8 Phase 8 — command ledger (dev/test) against Sync V1 state.
 */
import type {
  NotificationRuntimeEvent,
  NotificationRuntimeState,
} from './notification-runtime.types';

const ENABLED =
  typeof process !== 'undefined' &&
  process.env.NEXT_PUBLIC_RUNTIME_COMMAND_LEDGER === '1';

export function recordCommand(
  event: NotificationRuntimeEvent,
  before: NotificationRuntimeState,
  after: NotificationRuntimeState,
): void {
  if (!ENABLED) return;
  console.log('[runtime-command-ledger]', {
    type: event.type,
    revisionBefore: before.revision,
    revisionAfter: after.revision,
    activeBefore: before.activeItemId,
    activeAfter: after.activeItemId,
    passiveBefore: before.passiveItemIds.length,
    passiveAfter: after.passiveItemIds.length,
  });
}
