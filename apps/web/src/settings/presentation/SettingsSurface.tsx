/**
 * Settings presentation surface — read model + presenter + UI events.
 * Domain intents and application close intents are emitted outward.
 */
'use client';

import { useCallback, useSyncExternalStore } from 'react';
import type { SettingsController } from '../settings.controller';
import type { SettingsIntent } from '../settings.types';
import {
  mapSettingsUiEvent,
  presentSettingsState,
  type SettingsUiEvent,
} from './settings.presenter';
import { SettingsScreen } from './SettingsScreen';

export type SettingsSurfaceProps = {
  controller: SettingsController;
  onDomainIntent: (intent: SettingsIntent) => void;
  onCloseSettings: () => void;
};

function useSettingsState(controller: SettingsController) {
  return useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState,
  );
}

export function SettingsSurface({
  controller,
  onDomainIntent,
  onCloseSettings,
}: SettingsSurfaceProps) {
  const state = useSettingsState(controller);
  const viewState = presentSettingsState(state);

  const onEvent = useCallback(
    (event: SettingsUiEvent) => {
      const mapped = mapSettingsUiEvent(event);
      if (mapped.kind === 'DOMAIN') {
        onDomainIntent(mapped.intent);
        return;
      }
      onCloseSettings();
    },
    [onDomainIntent, onCloseSettings],
  );

  return (
    <div data-surface-owner="SETTINGS">
      <SettingsScreen viewState={viewState} onEvent={onEvent} />
    </div>
  );
}
