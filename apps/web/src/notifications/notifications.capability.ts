/**
 * Notifications → DomainCapability projection.
 */
import type { DomainCapability } from '@/domain-capability';
import type { NotificationRuntimeState } from '@/notification-runtime/notification-runtime.types';

export function mapNotificationsCapability(
  state: NotificationRuntimeState,
): DomainCapability {
  if (
    state.action.status === 'pending' ||
    state.lifecycle.status === 'submitting'
  ) {
    return {
      transition: 'BLOCKED',
      reason: 'NOTIFICATION_ACTION_IN_PROGRESS',
    };
  }
  return { transition: 'ALLOWED' };
}
