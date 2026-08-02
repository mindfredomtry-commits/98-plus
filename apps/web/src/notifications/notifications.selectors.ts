/**
 * Notifications domain read-model projection for presentation.
 * Presenter must not read readyHead / queue directly.
 */
import {
  selectActiveItem,
  selectActiveItemId,
} from '@/notification-runtime/notification-runtime.selectors';
import {
  notificationItemId,
  type NotificationItem,
  type NotificationRuntimeState,
} from '@/notification-runtime/notification-runtime.types';
import type {
  NotificationsActiveItemView,
  NotificationsActivationOutcome,
  NotificationsDomainState,
} from './notifications.types';

function senderLabelFromItem(item: NotificationItem): string {
  if (item.kind === 'result') {
    const sender = item.result.sender;
    return sender.username
      ? `@${sender.username}`
      : sender.firstName || '—';
  }
  const sender = item.ban.sender;
  return sender.username ? `@${sender.username}` : sender.firstName || '—';
}

function toActiveView(item: NotificationItem): NotificationsActiveItemView {
  const itemId = notificationItemId(item);
  if (item.kind === 'incoming') {
    return {
      kind: 'incoming',
      itemId,
      senderLabel: senderLabelFromItem(item),
      text: item.ban.text,
    };
  }
  if (item.kind === 'check') {
    return {
      kind: 'check',
      itemId,
      senderLabel: senderLabelFromItem(item),
      text: item.ban.text,
    };
  }
  return {
    kind: 'result',
    itemId,
    senderLabel: senderLabelFromItem(item),
    text: item.result.text,
    headline: item.result.headline,
    subline: item.result.subline,
  };
}

export function selectNotificationsDomainState(
  state: NotificationRuntimeState,
  lastActivationOutcome: NotificationsActivationOutcome | null = null,
): NotificationsDomainState {
  const activeId = selectActiveItemId(state);
  const activeItem = selectActiveItem(state);
  return {
    activation: activeId
      ? { type: 'ACTIVE', itemId: activeId }
      : { type: 'INACTIVE' },
    activeItem: activeItem ? toActiveView(activeItem) : null,
    actionStatus: state.action.status,
    actionErrorCode: state.action.errorCode,
    lastActivationOutcome,
  };
}
