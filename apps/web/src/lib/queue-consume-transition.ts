/**
 * Pure notification-queue consume transitions (no UI / owner architecture).
 *
 * Shared by runtime consume paths and scripts/queue-consume-transition tests.
 */

export type NotificationQueueState<T> = {
  overlayQueue: T[];
  pending: T[];
};

/**
 * Incoming-style handoff:
 * if overlayQueue empty && pending not empty → promote pending into overlay.
 * Otherwise keep current queues.
 */
export function promotePendingIfOverlayEmpty<T>(
  state: NotificationQueueState<T>,
): NotificationQueueState<T> {
  if (state.overlayQueue.length > 0) return state;
  if (state.pending.length === 0) return state;
  return {
    overlayQueue: [...state.pending],
    pending: [],
  };
}
