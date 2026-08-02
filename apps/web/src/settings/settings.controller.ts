/**
 * Settings domain controller — stable snapshots for presentation.
 * No Coordinator / CreateBan / Notification Runtime imports.
 */
import { mapSettingsCapability } from './settings.capability';
import {
  createInitialSettingsState,
  settingsReducer,
} from './settings.reducer';
import type {
  SettingsIntent,
  SettingsState,
} from './settings.types';
import type { DomainCapability } from '@/domain-capability';

export type SettingsListener = (state: SettingsState) => void;

export type SettingsController = {
  getState(): SettingsState;
  subscribe(listener: SettingsListener): () => void;
  dispatch(intent: SettingsIntent): void;
  getCapability(): DomainCapability;
  asDomainPort(): {
    dispatch(intent: SettingsIntent): void;
    getCapability(): DomainCapability;
  };
  dispose(): void;
};

export function createSettingsController(): SettingsController {
  let state = createInitialSettingsState();
  let disposed = false;
  const listeners = new Set<SettingsListener>();

  function emit(): void {
    for (const listener of [...listeners]) {
      listener(state);
    }
  }

  const controller: SettingsController = {
    getState() {
      return state;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    dispatch(intent) {
      if (disposed) return;
      const result = settingsReducer(state, intent);
      if (!result.changed) return;
      state = result.state;
      emit();
    },

    getCapability() {
      return mapSettingsCapability(state);
    },

    asDomainPort() {
      return {
        dispatch(intent) {
          controller.dispatch(intent);
        },
        getCapability() {
          return controller.getCapability();
        },
      };
    },

    dispose() {
      disposed = true;
      listeners.clear();
    },
  };

  return controller;
}
