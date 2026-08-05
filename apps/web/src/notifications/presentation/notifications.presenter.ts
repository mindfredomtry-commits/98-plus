/**
 * Pure Notifications presenter — domain state → ViewState / UI events → intents.
 * No Runtime store, Coordinator, HTTP, CreateBan, or Settings imports.
 */
import type {
  NotificationsDomainState,
  NotificationsIntent,
} from '../notifications.types';

export type NotificationsActionView =
  | { id: 'ACCEPT'; label: string }
  | { id: 'CONFIRM_YES'; label: string }
  | { id: 'CONFIRM_NO'; label: string }
  | { id: 'DISMISS_RESULT'; label: string }
  | { id: 'DISMISS'; label: string }
  | { id: 'RETRY'; label: string };

export type NotificationsViewState =
  | {
      phase: 'EMPTY';
      title: string;
      closeLabel: string;
    }
  | {
      phase: 'ITEM';
      itemId: string;
      title: string;
      senderLabel: string;
      text: string;
      actionStatus: 'IDLE' | 'SUBMITTING' | 'ERROR';
      errorMessage: string | null;
      actions: NotificationsActionView[];
      closeAllowed: boolean;
      closeLabel: string;
    };

export type NotificationsUiEvent =
  | { type: 'ACTION_PRESSED'; actionId: NotificationsActionView['id'] }
  | { type: 'CLOSE_PRESSED' };

export type NotificationsPresenterOutput =
  | { kind: 'DOMAIN'; intent: NotificationsIntent }
  /** @deprecated Close release is SESSION_COMPLETE-only; prefer DOMAIN close. */
  | { kind: 'APPLICATION'; intent: 'NOTIFICATIONS_RELEASE_REQUESTED' };

export function presentNotificationsState(
  state: NotificationsDomainState,
): NotificationsViewState {
  if (state.activation.type === 'INACTIVE' || state.activeItem == null) {
    return {
      phase: 'EMPTY',
      title: 'Уведомление',
      closeLabel: 'Закрыть',
    };
  }

  const item = state.activeItem;
  const submitting = state.actionStatus === 'pending';
  const failed = state.actionStatus === 'failed';
  const actionStatus: 'IDLE' | 'SUBMITTING' | 'ERROR' = submitting
    ? 'SUBMITTING'
    : failed
      ? 'ERROR'
      : 'IDLE';

  const actions: NotificationsActionView[] = [];
  if (failed) {
    actions.push({ id: 'RETRY', label: 'Повторить' });
  } else if (item.kind === 'incoming') {
    actions.push({ id: 'ACCEPT', label: 'Принять' });
    actions.push({ id: 'DISMISS', label: 'Отклонить' });
  } else if (item.kind === 'check') {
    actions.push({ id: 'CONFIRM_YES', label: 'Выполнено' });
    actions.push({ id: 'CONFIRM_NO', label: 'Не выполнено' });
  } else {
    actions.push({ id: 'DISMISS_RESULT', label: 'Закрыть результат' });
  }

  const text =
    item.kind === 'result'
      ? [item.headline, item.subline, item.text].filter(Boolean).join('\n')
      : item.text;

  return {
    phase: 'ITEM',
    itemId: item.itemId,
    title: 'Уведомление',
    senderLabel: item.senderLabel,
    text,
    actionStatus,
    errorMessage: failed
      ? state.actionErrorCode ?? 'Ошибка действия'
      : null,
    actions,
    closeAllowed: !submitting,
    closeLabel: 'Закрыть',
  };
}

export function mapNotificationsUiEvent(
  event: NotificationsUiEvent,
): NotificationsPresenterOutput {
  switch (event.type) {
    case 'CLOSE_PRESSED':
      // Authoritative Close: domain reinsert + SESSION_COMPLETE → sink release.
      // Do not emit APPLICATION NOTIFICATIONS_RELEASE_REQUESTED (dual producer).
      return {
        kind: 'DOMAIN',
        intent: { type: 'ACTIVE_ITEM_CLOSE_REQUESTED' },
      };
    case 'ACTION_PRESSED': {
      switch (event.actionId) {
        case 'ACCEPT':
          return {
            kind: 'DOMAIN',
            intent: {
              type: 'ITEM_ACTION_REQUESTED',
              action: { type: 'ACCEPT' },
            },
          };
        case 'CONFIRM_YES':
          return {
            kind: 'DOMAIN',
            intent: {
              type: 'ITEM_ACTION_REQUESTED',
              action: { type: 'CONFIRM_CHECK', completed: true },
            },
          };
        case 'CONFIRM_NO':
          return {
            kind: 'DOMAIN',
            intent: {
              type: 'ITEM_ACTION_REQUESTED',
              action: { type: 'CONFIRM_CHECK', completed: false },
            },
          };
        case 'DISMISS_RESULT':
          return {
            kind: 'DOMAIN',
            intent: {
              type: 'ITEM_ACTION_REQUESTED',
              action: { type: 'DISMISS_RESULT' },
            },
          };
        case 'DISMISS':
          return {
            kind: 'DOMAIN',
            intent: {
              type: 'ITEM_ACTION_REQUESTED',
              action: { type: 'DISMISS' },
            },
          };
        case 'RETRY':
          return { kind: 'DOMAIN', intent: { type: 'RETRY_REQUESTED' } };
        default: {
          const _exhaustive: never = event.actionId;
          void _exhaustive;
          return {
            kind: 'DOMAIN',
            intent: { type: 'ACTIVE_ITEM_CLOSE_REQUESTED' },
          };
        }
      }
    }
    default: {
      const _exhaustive: never = event;
      void _exhaustive;
      return {
        kind: 'DOMAIN',
        intent: { type: 'ACTIVE_ITEM_CLOSE_REQUESTED' },
      };
    }
  }
}
