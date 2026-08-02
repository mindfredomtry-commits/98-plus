/**
 * Notifications target availability — ready or active item may start the domain.
 * Does not expose queue arrays to Application Policy.
 */
import {
  available,
  unavailable,
  type DomainAvailability,
} from '@/domain-availability';
import {
  selectActiveItemId,
  selectReadyHeadId,
} from '@/notification-runtime/notification-runtime.selectors';
import type { NotificationRuntimeState } from '@/notification-runtime/notification-runtime.types';

export function mapNotificationsAvailability(
  state: NotificationRuntimeState,
): DomainAvailability {
  if (selectActiveItemId(state) != null || selectReadyHeadId(state) != null) {
    return available();
  }
  return unavailable('NO_READY_OR_ACTIVE_ITEM');
}
