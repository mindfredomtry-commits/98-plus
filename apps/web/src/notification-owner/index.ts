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
