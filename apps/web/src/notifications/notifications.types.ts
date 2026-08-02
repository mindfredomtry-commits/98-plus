/**
 * Notifications domain intents — Stage 8 Phase 5.
 * Owner switching is application-level; these intents process the active item.
 */

export type NotificationItemAction =
  | { type: 'ACCEPT' }
  | { type: 'CONFIRM_CHECK'; completed: boolean }
  | { type: 'DISMISS_RESULT' }
  | { type: 'DISMISS' };

export type NotificationsIntent =
  | { type: 'ACTIVATE_READY_ITEM_REQUESTED' }
  | {
      type: 'ITEM_ACTION_REQUESTED';
      action: NotificationItemAction;
    }
  | { type: 'ACTIVE_ITEM_CLOSE_REQUESTED' }
  | { type: 'RETRY_REQUESTED' }
  | { type: 'CLEAR_ACTIVATION_REQUESTED' };

export type NotificationsActivationOutcome =
  | { type: 'ACTIVATED'; itemId: string }
  | { type: 'ALREADY_ACTIVE'; itemId: string }
  | { type: 'NO_READY_ITEM' };

/**
 * Domain read model for presentation — active item only (never readyHead).
 */
export type NotificationsDomainState = {
  activation:
    | { type: 'INACTIVE' }
    | { type: 'ACTIVE'; itemId: string };
  activeItem: NotificationsActiveItemView | null;
  actionStatus: 'idle' | 'pending' | 'succeeded' | 'failed';
  actionErrorCode: string | null;
  lastActivationOutcome: NotificationsActivationOutcome | null;
};

export type NotificationsActiveItemView =
  | {
      kind: 'incoming';
      itemId: string;
      senderLabel: string;
      text: string;
    }
  | {
      kind: 'check';
      itemId: string;
      senderLabel: string;
      text: string;
    }
  | {
      kind: 'result';
      itemId: string;
      senderLabel: string;
      text: string;
      headline: string;
      subline: string;
    };
