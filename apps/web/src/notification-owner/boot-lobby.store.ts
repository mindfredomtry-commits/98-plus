/**
 * Live BOOT/LOBBY owner store. Stable getSnapshot — no new object per read.
 */

import { reduceNotificationOwnerBootLobby } from './boot-lobby.reducer';
import {
  createInitialNotificationOwnerBootLobbyState,
  type NotificationOwnerBootLobbyInput,
  type NotificationOwnerBootLobbyState,
} from './boot-lobby.types';

type Listener = () => void;

let state: NotificationOwnerBootLobbyState =
  createInitialNotificationOwnerBootLobbyState();
const listeners = new Set<Listener>();

export function getNotificationOwnerBootLobbyState(): NotificationOwnerBootLobbyState {
  return state;
}

export function subscribeNotificationOwnerBootLobby(
  listener: Listener,
): () => void {
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

export function dispatchNotificationOwnerBootLobby(
  input: NotificationOwnerBootLobbyInput,
): NotificationOwnerBootLobbyState {
  const result = reduceNotificationOwnerBootLobby(state, input);
  if (result.rejected) {
    return state;
  }
  if (result.state !== state) {
    state = result.state;
    emit();
  }
  return state;
}

/** Test harness only. */
export function resetNotificationOwnerBootLobbyStoreForTests(
  next: NotificationOwnerBootLobbyState = createInitialNotificationOwnerBootLobbyState(),
): void {
  state = next;
  emit();
}
