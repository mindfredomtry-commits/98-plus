/**
 * Minimal Settings UI — ViewState in, SettingsUiEvent out.
 * No controller, store, Coordinator, or domain ports.
 */
'use client';

import type {
  SettingsUiEvent,
  SettingsViewState,
} from './settings.presenter';

export type SettingsScreenProps = {
  viewState: SettingsViewState;
  onEvent: (event: SettingsUiEvent) => void;
};

export function SettingsScreen({ viewState, onEvent }: SettingsScreenProps) {
  return (
    <div
      className="settings-screen pt-12 px-4"
      data-testid="settings-screen"
    >
      <h1 className="text-lg mb-6">{viewState.title}</h1>
      <p className="text-sm text-muted mb-3">
        {viewState.preferenceSectionLabel}
      </p>
      <ul className="space-y-2 mb-8">
        {viewState.options.map((option) => (
          <li key={option.id}>
            <button
              type="button"
              className="settings-option block w-full text-left text-sm py-2"
              data-testid={`settings-option-${option.id}`}
              data-selected={option.selected ? '1' : '0'}
              aria-pressed={option.selected}
              onClick={() =>
                onEvent({
                  type: 'PREFERENCE_SELECTED',
                  preference: option.id,
                })
              }
            >
              {option.selected ? '[x] ' : '[ ] '}
              {option.label}
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="settings-close text-sm text-muted"
        data-testid="settings-close"
        onClick={() => onEvent({ type: 'CLOSE_PRESSED' })}
      >
        {viewState.closeLabel}
      </button>
    </div>
  );
}
