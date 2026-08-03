/**
 * Notifications availability — Phase 8 cutover to selectNotificationsAvailabilityV1.
 * Coordinator must not inspect syncStatus / revision / items.
 */
import {
  available,
  unavailable,
  type DomainAvailability,
} from '@/domain-availability';
import { selectNotificationsAvailabilityV1 } from '@/notification-runtime/notification-runtime.reconcile';
import type { NotificationRuntimeState } from '@/notification-runtime/notification-runtime.types';

export function mapNotificationsAvailability(
  state: NotificationRuntimeState,
): DomainAvailability {
  const result = selectNotificationsAvailabilityV1(state);
  if (result.available) return available();
  return unavailable(result.reason);
}
