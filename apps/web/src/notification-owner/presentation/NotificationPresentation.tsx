'use client';

import React from 'react';
import type { NotificationPresentationState } from '../notification-owner.types';
import {
  ActionPendingFromPresentation,
  type PresentationIntentHandler,
} from './presentation-intent';
import {
  BootSurface,
  CheckSurface,
  ConfirmSurface,
  IncomingSurface,
  LobbySurface,
  ResultSurface,
  SendingSurface,
  SuccessSurface,
  WhatSurface,
} from './surfaces';

export type NotificationPresentationProps = {
  state: NotificationPresentationState;
  onIntent: PresentationIntentHandler;
};

/**
 * Pure renderer — one branch per presentation kind.
 * Does not own queue/display/action. Emits intents only.
 * Continuously mounted by NotificationPresentationController.
 */
export function NotificationPresentation({
  state,
  onIntent,
}: NotificationPresentationProps) {
  switch (state.kind) {
    case 'BOOT':
      return <BootSurface />;
    case 'LOBBY':
      return <LobbySurface onIntent={onIntent} />;
    case 'WHAT':
      return <WhatSurface draft={state.draft} onIntent={onIntent} />;
    case 'CONFIRM':
      return <ConfirmSurface draft={state.draft} onIntent={onIntent} />;
    case 'SENDING':
      return <SendingSurface banText={state.snapshot.banText} />;
    case 'SUCCESS':
      return (
        <SuccessSurface snapshot={state.snapshot} onIntent={onIntent} />
      );
    case 'INCOMING':
      if (!state.card || !state.displayId || !state.banId) {
        throw new Error('INCOMING requires complete card model');
      }
      return (
        <IncomingSurface
          displayId={state.displayId}
          banId={state.banId}
          card={state.card}
          onIntent={onIntent}
        />
      );
    case 'CHECK':
      if (!state.card || !state.displayId || !state.banId) {
        throw new Error('CHECK requires complete card model');
      }
      return (
        <CheckSurface
          displayId={state.displayId}
          banId={state.banId}
          card={state.card}
          onIntent={onIntent}
        />
      );
    case 'ACTION_PENDING':
      return (
        <ActionPendingFromPresentation state={state} onIntent={onIntent} />
      );
    case 'RESULT':
      if (!state.card || !state.displayId || !state.banId) {
        throw new Error('RESULT requires complete card model');
      }
      return (
        <ResultSurface
          displayId={state.displayId}
          banId={state.banId}
          card={state.card}
          onIntent={onIntent}
        />
      );
    default: {
      const _exhaustive: never = state;
      void _exhaustive;
      throw new Error('unknown presentation state');
    }
  }
}
