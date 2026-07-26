'use client';

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import type {
  PresentationState,
} from '@/notification-runtime/notification-runtime.presentation';
import {
  assertPresentationInvariants,
  presentationSurfaceMount,
  selectPresentationState,
} from '@/notification-runtime/notification-runtime.presentation';
import type { NotificationRuntimeState } from '@/notification-runtime/notification-runtime.types';
import { LobbySurface } from './LobbySurface';
import { NotificationSurface } from './NotificationSurface';
import { TransitionSurface } from './TransitionSurface';

const PresentationStateContext = createContext<PresentationState>({
  mode: 'LOBBY',
});

export function usePresentationState(): PresentationState {
  return useContext(PresentationStateContext);
}

/** True when InstantBanFlow may mount Lobby orb/logo/chrome/CTA. */
export function useIsLobbySurfaceActive(): boolean {
  return usePresentationState().mode === 'LOBBY';
}

/** True when SUCCESS card should render inside NotificationSurface. */
export function useIsSuccessNotificationActive(): boolean {
  const p = usePresentationState();
  return p.mode === 'NOTIFICATION' && p.display.kind === 'success';
}

type PresentationRootProps = {
  runtimeState: NotificationRuntimeState;
  /** InstantBanFlow / page tree — Lobby DOM only when mode=LOBBY. */
  children: ReactNode;
  /** Overlay host + queue cards — only when NOTIFICATION with card display. */
  notificationOverlays: ReactNode;
};

/**
 * Single root switch: Lobby | Transition | Notification — never co-mounted.
 */
export function PresentationRoot({
  runtimeState,
  children,
  notificationOverlays,
}: PresentationRootProps) {
  const presentation = useMemo(
    () => selectPresentationState(runtimeState),
    [runtimeState],
  );
  const surfaces = presentationSurfaceMount(presentation);

  assertPresentationInvariants(presentation, runtimeState, {
    mountedSurfaces: surfaces,
  });

  return (
    <PresentationStateContext.Provider value={presentation}>
      {presentation.mode === 'LOBBY' ? (
        <LobbySurface>{children}</LobbySurface>
      ) : null}

      {presentation.mode === 'TRANSITION' ? (
        <>
          {/* Controller stays mounted without Lobby DOM (InstantBanFlow gates). */}
          <div data-presentation-controller="true" hidden aria-hidden>
            {children}
          </div>
          <TransitionSurface reason={presentation.reason} />
        </>
      ) : null}

      {presentation.mode === 'NOTIFICATION' ? (
        <NotificationSurface display={presentation.display}>
          {/* Controller: SUCCESS card or headless; no Lobby DOM. */}
          <div
            data-presentation-controller="true"
            data-presentation-controller-for="notification"
          >
            {children}
          </div>
          {presentation.display.kind !== 'success' ? notificationOverlays : null}
        </NotificationSurface>
      ) : null}
    </PresentationStateContext.Provider>
  );
}
