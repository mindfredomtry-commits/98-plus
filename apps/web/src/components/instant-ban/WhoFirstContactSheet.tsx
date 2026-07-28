'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';

export type WhoFirstContactSheetProps = {
  open: boolean;
  busy: boolean;
  error: string | null;
  inviteRequiredUsername: string | null;
  onClose: () => void;
  onSubmitUsername: (username: string) => void;
  onInviteShare: () => void;
};

export function WhoFirstContactSheet({
  open,
  busy,
  error,
  inviteRequiredUsername,
  onClose,
  onSubmitUsername,
  onInviteShare,
}: WhoFirstContactSheetProps) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');

  useEffect(() => {
    if (!open) {
      setValue('');
      return;
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [open]);

  const handleSubmit = useCallback(() => {
    if (busy) return;
    onSubmitUsername(value);
  }, [busy, onSubmitUsername, value]);

  if (!open) return null;

  return (
    <div
      className="instant-ban-first-contact"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-who-first-contact-sheet=""
    >
      <button
        type="button"
        className="instant-ban-first-contact__backdrop"
        aria-label="Закрыть"
        onClick={onClose}
        disabled={busy}
      />
      <div className="instant-ban-first-contact__panel">
        <div className="instant-ban-first-contact__header">
          <h2 id={titleId} className="instant-ban-first-contact__title">
            Кому ещё запретишь?
          </h2>
          <button
            type="button"
            className="instant-ban-first-contact__close"
            onClick={onClose}
            disabled={busy}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <p className="instant-ban-first-contact__hint">
          Введи Telegram @username — если человек уже в 98+, сразу откроется
          запрет.
        </p>

        <label className="instant-ban-first-contact__label" htmlFor="who-first-contact-username">
          @username
        </label>
        <input
          ref={inputRef}
          id="who-first-contact-username"
          className="instant-ban-first-contact__input"
          type="text"
          inputMode="text"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="@username"
          value={value}
          disabled={busy}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSubmit();
            }
          }}
          data-who-first-contact-input=""
        />

        {error ? (
          <p className="instant-ban-first-contact__error" role="alert" data-who-first-contact-error="">
            {error}
          </p>
        ) : null}

        {inviteRequiredUsername ? (
          <p
            className="instant-ban-first-contact__invite-note"
            data-who-first-contact-unregistered=""
          >
            @{inviteRequiredUsername} ещё не в 98+. Пригласи через Telegram.
          </p>
        ) : null}

        <button
          type="button"
          className="instant-ban-first-contact__submit"
          onClick={handleSubmit}
          disabled={busy || !value.trim()}
          data-who-first-contact-submit=""
        >
          {busy ? 'Ищем…' : 'Продолжить'}
        </button>

        <button
          type="button"
          className="instant-ban-first-contact__share"
          onClick={onInviteShare}
          disabled={busy}
          data-who-first-contact-share=""
        >
          Пригласить в Telegram
        </button>
      </div>
    </div>
  );
}
