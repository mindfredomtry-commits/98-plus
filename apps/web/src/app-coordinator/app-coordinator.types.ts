/**
 * App Coordinator types — Stage 8 Phase 4.
 *
 * Authority: currentOwner (+ returnOwner for temporary Settings).
 */
import type { ApplicationOwner } from './application-owner';
import type { OwnerRequest } from './owner-request';

export type { ApplicationOwner, DomainId } from './application-owner';
export type { DomainCapability } from '@/domain-capability';
export type { OwnerRequest, OwnerRequestReason } from './owner-request';

/** @deprecated Import ProductRoute from create-ban.types — kept for type re-exports. */
export type { ProductRoute } from '@/product-flow/create-ban/create-ban.types';

export type AppCoordinatorState = {
  currentOwner: ApplicationOwner;
  /** One-level return context for temporary owners (Settings). */
  returnOwner: ApplicationOwner | null;
};

export type NotificationEntryKind = 'incoming' | 'status';

/**
 * Launch entry intent.
 * PRODUCT → request default CREATE_BAN owner (no surface mount).
 * NOTIFICATION → Runtime ingest only (no Notifications owner yet).
 */
export type EntryIntent =
  | { type: 'PRODUCT' }
  | {
      type: 'NOTIFICATION';
      itemId: string;
      notificationKind: NotificationEntryKind;
    };

/** Backward-compatible name for foundation tests. */
export type AppEntryIntent = EntryIntent;

export type AppCoordinatorEvent =
  | { type: 'APP_STARTED' }
  | { type: 'BOOT_COMPLETED' }
  | { type: 'ENTRY_ROUTED'; intent: AppEntryIntent }
  | { type: 'OWNER_REQUESTED'; request: OwnerRequest }
  | { type: 'OPEN_SETTINGS_REQUESTED' }
  | { type: 'CLOSE_SETTINGS_REQUESTED' }
  | { type: 'DOMAIN_RELEASED' }
  | { type: 'RECONNECT_STARTED' }
  | { type: 'RECONNECT_COMPLETED' };

export type RuntimeCoordinatorCommand =
  | {
      type: 'INGEST_ENTRY';
      intent: Extract<EntryIntent, { type: 'NOTIFICATION' }>;
    }
  | { type: 'FLUSH_DEFERRED_DIRECT_ENTRY' };

export type AppCoordinatorEffect = {
  target: 'NOTIFICATION_RUNTIME';
  command: RuntimeCoordinatorCommand;
};

export type AppCoordinatorResult = {
  state: AppCoordinatorState;
  effects: AppCoordinatorEffect[];
  violation: AppCoordinatorInvariantViolation | null;
};

export type AppCoordinatorInvariantCode =
  | 'UNEXPECTED_EVENT'
  | 'UNREGISTERED_DOMAIN'
  | 'BOOT_OWNER_FORBIDDEN'
  | 'DOMAIN_INTENT_NOT_CURRENT_OWNER'
  | 'MISSING_RETURN_OWNER';

export type AppCoordinatorInvariantViolation = {
  code: AppCoordinatorInvariantCode;
  eventType: AppCoordinatorEvent['type'] | 'DOMAIN_INTENT';
  message: string;
};

export function createInitialAppCoordinatorState(): AppCoordinatorState {
  return {
    currentOwner: { type: 'BOOT' },
    returnOwner: null,
  };
}
