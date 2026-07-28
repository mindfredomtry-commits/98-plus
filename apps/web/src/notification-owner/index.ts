/**
 * NotificationOwner public surface — BOOT/LOBBY/WHO ownership slice.
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
  useNotificationOwnerWhoProjection,
} from './boot-lobby.adapter';
