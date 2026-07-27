/**
 * NotificationOwner public surface — BOOT/LOBBY ownership slice.
 * No presentation renderer. No .np-* UI.
 */

export {
  createInitialNotificationOwnerBootLobbyState,
  type BootLobbyPresentation,
  type NotificationOwnerBootLobbyInput,
  type NotificationOwnerBootLobbyReduceResult,
  type NotificationOwnerBootLobbyState,
} from './boot-lobby.types';
export { reduceNotificationOwnerBootLobby } from './boot-lobby.reducer';
export {
  dispatchNotificationOwnerBootLobby,
  getNotificationOwnerBootLobbyState,
  resetNotificationOwnerBootLobbyStoreForTests,
  subscribeNotificationOwnerBootLobby,
} from './boot-lobby.store';
export {
  planBootLobbyVisuals,
  useNotificationOwnerBootLobbyBridge,
} from './boot-lobby.adapter';
