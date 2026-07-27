/**
 * Notification Owner — public Phase 2 surface.
 */
export type {
  ActionLedgerEntry,
  BanId,
  CheckCardModel,
  ComposeDraft,
  ConsumedTombstone,
  DisplayId,
  IncomingCardModel,
  NotificationOwnerCommand,
  NotificationOwnerEvent,
  NotificationOwnerInput,
  NotificationOwnerReduceResult,
  NotificationOwnerState,
  NotificationPresentationState,
  QueueItem,
  QueuedCheck,
  QueuedIncoming,
  QueuedResult,
  ResultCardModel,
  SendSnapshot,
  SuccessSnapshot,
} from './notification-owner.types';

export {
  banIdOfPresentation,
  createInitialNotificationOwnerState,
  displayIdOfPresentation,
  emptyComposeDraft,
  filterUnconsumedQueue,
  isConsumedBan,
} from './notification-owner.types';

export {
  assertNotificationOwnerInvariants,
  paintedKind,
  presentationKind,
} from './notification-owner.invariants';

export {
  reduceNotificationOwner,
  reduceNotificationOwnerUnchecked,
} from './notification-owner.reducer';

export {
  NotificationPresentation,
  NotificationPresentationController,
  countTopLevelSurfaces,
  resolvePresentationSurface,
} from './presentation';
export type {
  NotificationPresentationProps,
  NotificationPresentationControllerProps,
  PresentationIntentHandler,
  PresentationSurfaceDescriptor,
  PresentationSurfaceId,
} from './presentation';

export {
  NOTIFICATION_OWNER_CUTOVER,
  isNotificationOwnerCutoverLive,
} from './notification-owner.cutover';

export {
  dispatchNotificationOwner,
  getNotificationOwnerState,
  subscribeNotificationOwner,
  resetNotificationOwnerStoreForTests,
} from './notification-owner.store';

export {
  queueItemFromIncoming,
  queueItemFromCheck,
  queueItemFromResult,
  resultCardFromBanResult,
} from './notification-owner.ingest';

export {
  ingestAndClaimIfLobby,
  ingestItems,
  ingestQueuedOverlay,
} from './notification-owner.live-ingest';
export type { QueuedOverlayIngestPayload } from './notification-owner.live-ingest';
