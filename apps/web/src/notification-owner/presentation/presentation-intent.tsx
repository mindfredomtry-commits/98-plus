'use client';

import React from 'react';
import type {
  NotificationOwnerCommand,
  NotificationPresentationState,
} from '../notification-owner.types';
import { CheckSurface, IncomingSurface } from './surfaces';

export type PresentationIntentHandler = (
  command: NotificationOwnerCommand,
) => void;

export function ActionPendingFromPresentation({
  state,
  onIntent,
}: {
  state: Extract<NotificationPresentationState, { kind: 'ACTION_PENDING' }>;
  onIntent: PresentationIntentHandler;
}) {
  if (!state.card || !state.displayId || !state.banId) {
    throw new Error('ACTION_PENDING requires complete card model');
  }
  if (state.from === 'CHECK') {
    return (
      <CheckSurface
        displayId={state.displayId}
        banId={state.banId}
        card={state.card as { text: string; senderLabel: string }}
        onIntent={onIntent}
        pending
      />
    );
  }
  return (
    <IncomingSurface
      displayId={state.displayId}
      banId={state.banId}
      card={state.card as { text: string; senderLabel: string }}
      onIntent={onIntent}
      pending
      actionLabel={state.action}
    />
  );
}
