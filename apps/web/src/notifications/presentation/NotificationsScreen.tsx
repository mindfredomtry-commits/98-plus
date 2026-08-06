/**
 * Minimal Notifications UI — ViewState in, NotificationsUiEvent out.
 * No Runtime, controller, store, Coordinator, or API imports.
 */
'use client';

import React from 'react';
import type {
  NotificationsUiEvent,
  NotificationsViewState,
} from './notifications.presenter';

export type NotificationsScreenProps = {
  viewState: NotificationsViewState;
  onEvent: (event: NotificationsUiEvent) => void;
};

export function NotificationsScreen({
  viewState,
  onEvent,
}: NotificationsScreenProps) {
  if (viewState.phase === 'EMPTY') {
    return (
      <div
        className="notifications-screen pt-12 px-4"
        data-testid="notifications-screen"
        data-phase="EMPTY"
      >
        <h1 className="text-lg mb-6">{viewState.title}</h1>
        <p className="text-sm text-muted mb-8">Нет активного уведомления</p>
        <button
          type="button"
          className="notifications-close text-sm text-muted"
          data-testid="notifications-close"
          onClick={() => onEvent({ type: 'CLOSE_PRESSED' })}
        >
          {viewState.closeLabel}
        </button>
      </div>
    );
  }

  return (
    <div
      className="notifications-screen pt-12 px-4"
      data-testid="notifications-screen"
      data-phase="ITEM"
      data-item-id={viewState.itemId}
    >
      <h1 className="text-lg mb-4">{viewState.title}</h1>
      <p className="text-sm text-muted mb-2">
        От: <span data-testid="notifications-sender">{viewState.senderLabel}</span>
      </p>
      <p
        className="text-sm whitespace-pre-wrap mb-6"
        data-testid="notifications-text"
      >
        {viewState.text}
      </p>
      {viewState.actionStatus === 'ERROR' && viewState.errorMessage ? (
        <p className="text-sm text-red-600 mb-4" data-testid="notifications-error">
          {viewState.errorMessage}
        </p>
      ) : null}
      {viewState.actionStatus === 'SUBMITTING' ? (
        <p className="text-sm text-muted mb-4" data-testid="notifications-submitting">
          Отправка…
        </p>
      ) : null}
      <div className="flex flex-col gap-2 mb-8">
        {viewState.actions.map((action) => (
          <button
            key={action.id}
            type="button"
            className="notifications-action text-sm py-2"
            data-testid={`notifications-action-${action.id}`}
            disabled={viewState.actionStatus === 'SUBMITTING'}
            onClick={() =>
              onEvent({ type: 'ACTION_PRESSED', actionId: action.id })
            }
          >
            {action.label}
          </button>
        ))}
      </div>
      {viewState.closeAllowed ? (
        <button
          type="button"
          className="notifications-close text-sm text-muted"
          data-testid="notifications-close"
          onClick={() => onEvent({ type: 'CLOSE_PRESSED' })}
        >
          {viewState.closeLabel}
        </button>
      ) : null}
    </div>
  );
}
