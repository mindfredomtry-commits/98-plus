/**
 * Notifications → DomainCapability projection (Phase 8).
 */
import type { DomainCapability } from '@/domain-capability';
import type { NotificationRuntimeState } from '@/notification-runtime/notification-runtime.types';

export function mapNotificationsCapability(
  state: NotificationRuntimeState,
): DomainCapability {
  if (state.action.status === 'SUBMITTING') {
    return {
      transition: 'BLOCKED',
      reason: 'NOTIFICATION_ACTION_IN_PROGRESS',
    };
  }
  return { transition: 'ALLOWED' };
}
