'use client';

import { useCallback } from 'react';
import type { NotificationMode } from '@98plus/shared';
import { WhatBackIcon } from './WhatBackIcon';

const MODE_OPTIONS: { id: NotificationMode; label: string }[] = [
  { id: 'normal', label: 'normal' },
  { id: 'real-time', label: 'real-time' },
];

const MODE_HINTS: Record<NotificationMode, string> = {
  'real-time': 'Новые запреты могут появляться сразу поверх лобби.',
  normal:
    'Уведомления копятся и открываются только через «твои запреты».',
};

type Props = {
  mode: NotificationMode;
  saving?: boolean;
  onClose: () => void;
  onModeChange: (mode: NotificationMode) => void;
};

export function ArenaSettingsPanel({
  mode,
  saving = false,
  onClose,
  onModeChange,
}: Props) {
  const handleSelect = useCallback(
    (next: NotificationMode) => {
      if (next === mode || saving) return;
      onModeChange(next);
    },
    [mode, onModeChange, saving],
  );

  return (
    <div className="instant-ban-settings-overlay" role="dialog" aria-label="Настройки">
      <div className="instant-ban-settings-overlay__dim" aria-hidden onClick={onClose} />
      <div className="instant-ban-settings-overlay__panel">
        <header className="instant-ban-settings-overlay__header">
          <button
            type="button"
            className="instant-ban-settings-overlay__back"
            onClick={onClose}
            aria-label="Назад"
          >
            <WhatBackIcon />
          </button>
          <h2 className="instant-ban-settings-overlay__title">Настройки</h2>
        </header>

        <div className="instant-ban-settings-overlay__section">
          <p className="instant-ban-settings-overlay__section-label">
            Режим уведомлений
          </p>
          <div
            className="instant-ban-settings-overlay__mode-toggle"
            role="radiogroup"
            aria-label="Режим уведомлений"
          >
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={mode === opt.id}
                className={`instant-ban-settings-overlay__mode-btn${
                  mode === opt.id
                    ? ' instant-ban-settings-overlay__mode-btn--active'
                    : ''
                }`}
                disabled={saving}
                onClick={() => handleSelect(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="instant-ban-settings-overlay__hint">{MODE_HINTS[mode]}</p>
        </div>
      </div>
    </div>
  );
}
