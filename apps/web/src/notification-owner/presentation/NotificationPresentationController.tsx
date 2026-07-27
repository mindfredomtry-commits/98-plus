'use client';

import React, { useRef } from 'react';
import type { NotificationOwnerState } from '../notification-owner.types';
import type { NotificationOwnerCommand } from '../notification-owner.types';
import { NotificationPresentation } from './NotificationPresentation';

export type NotificationPresentationControllerProps = {
  state: NotificationOwnerState;
  onIntent: (command: NotificationOwnerCommand) => void;
  /** Test/harness: stable id assigned once at controller mount. */
  mountIdForTest?: string;
};

/**
 * Continuously mounted controller.
 * Changing presentation.kind switches NotificationPresentation branches
 * without remounting this controller instance.
 *
 * No effect-driven correctness.
 * No DOM mount acknowledgement.
 * No timers.
 */
export function NotificationPresentationController({
  state,
  onIntent,
  mountIdForTest,
}: NotificationPresentationControllerProps) {
  const mountIdRef = useRef(
    mountIdForTest ?? `np-controller-${Math.random().toString(36).slice(2)}`,
  );

  return (
    <div
      data-notification-owner-controller=""
      data-np-controller-mount-id={mountIdRef.current}
      data-np-presentation-kind={state.presentation.kind}
    >
      <NotificationPresentation
        state={state.presentation}
        onIntent={onIntent}
      />
    </div>
  );
}
