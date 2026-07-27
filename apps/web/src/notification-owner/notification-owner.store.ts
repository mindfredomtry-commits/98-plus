/**
 * Single live store for notification-owner.
 * Stable getSnapshot references — no new object per read.
 */

import {
  createInitialNotificationOwnerState,
  reduceNotificationOwner,
  type NotificationOwnerInput,
  type NotificationOwnerState,
} from './index';

type Listener = () => void;

let state: NotificationOwnerState = createInitialNotificationOwnerState();
const listeners = new Set<Listener>();

export function getNotificationOwnerState(): NotificationOwnerState {
  return state;
}

export function subscribeNotificationOwner(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function dispatchNotificationOwner(
  input: NotificationOwnerInput,
): NotificationOwnerState {
  const result = reduceNotificationOwner(state, input);
  if (result.rejected) {
    if (typeof console !== 'undefined') {
      console.warn('[notification-owner] rejected', result.rejected, input);
    }
    return state;
  }
  if (result.state !== state) {
    state = result.state;
    emit();
  }
  return state;
}

/** Test harness only — resets singleton between specs. */
export function resetNotificationOwnerStoreForTests(
  next: NotificationOwnerState = createInitialNotificationOwnerState(),
): void {
  state = next;
  emit();
}
