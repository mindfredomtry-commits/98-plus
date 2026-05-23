'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ONBOARDING_DURATION_OPTIONS,
  ONBOARDING_SUGGESTION_CHIPS,
} from '@98plus/shared';

interface Props {
  banText: string;
  onBanTextChange: (value: string) => void;
  durationMinutes: number;
  onDurationChange: (minutes: number) => void;
  onPickChat: () => void;
  pickChatBusy?: boolean;
}

export function FirstBanOnboarding({
  banText,
  onBanTextChange,
  durationMinutes,
  onDurationChange,
  onPickChat,
  pickChatBusy = false,
}: Props) {
  const [customMode, setCustomMode] = useState(false);

  const chips = useMemo(
    () => [...ONBOARDING_SUGGESTION_CHIPS, 'другое'] as const,
    [],
  );

  function applyChip(chip: string) {
    if (chip === 'другое') {
      setCustomMode(true);
      onBanTextChange('');
      return;
    }
    setCustomMode(false);
    onBanTextChange(chip);
  }

  const canPickChat = banText.trim().length >= 3;

  return (
    <div className="first-ban-onboarding space-y-4">
      <header className="first-ban-hero text-center px-2 pt-1">
        <h2 className="text-xl font-bold tracking-tight text-white">
          Это твой первый запрет 👊
        </h2>
        <p className="text-sm text-muted/90 mt-2 leading-snug">
          Запрети что-то другу — он захочет ответить.
        </p>
      </header>

      <section className="onboarding-card glass-card border border-accent/20 p-4 shadow-glow-sm">
        <h3 className="onboarding-card-title">1. Что запрещаем?</h3>
        <div className="flex flex-wrap gap-2 mt-3">
          {chips.map((chip) => {
            const active =
              chip === 'другое'
                ? customMode
                : banText.trim().toLowerCase() === chip;
            return (
              <button
                key={chip}
                type="button"
                onClick={() => applyChip(chip)}
                className={`preset-chip ${active ? 'preset-chip-active' : ''}`}
              >
                {chip}
              </button>
            );
          })}
        </div>
        <label className="ban-textarea-wrap mt-3 block">
          <span className="sr-only">Текст запрета</span>
          <textarea
            value={banText}
            onChange={(e) => onBanTextChange(e.target.value)}
            placeholder="Напиши запрет..."
            rows={3}
            className="ban-textarea"
            maxLength={280}
          />
        </label>
      </section>

      <section className="onboarding-card glass-card border border-accent/20 p-4 shadow-glow-sm">
        <h3 className="onboarding-card-title">2. На сколько?</h3>
        <div className="flex flex-wrap gap-2 mt-3">
          {ONBOARDING_DURATION_OPTIONS.map((opt) => {
            const active = durationMinutes === opt.minutes;
            return (
              <motion.button
                key={opt.minutes}
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={() => onDurationChange(opt.minutes)}
                className={`onboarding-duration-btn ${active ? 'onboarding-duration-btn--active' : ''}`}
              >
                {opt.label}
              </motion.button>
            );
          })}
        </div>
      </section>

      <section className="onboarding-card glass-card border border-accent/20 p-4 shadow-glow-sm">
        <h3 className="onboarding-card-title">3. Кому отправляем?</h3>
        <div className="telegram-pick-card mt-3">
          <div className="telegram-pick-card__icon" aria-hidden>
            <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.05-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
            </svg>
          </div>
          <div className="telegram-pick-card__copy">
            <p className="telegram-pick-card__title">Выбери друга в Telegram</p>
            <p className="telegram-pick-card__subtitle">
              Ему придёт твой запрет.
            </p>
          </div>
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            disabled={!canPickChat || pickChatBusy}
            onClick={onPickChat}
            className="telegram-pick-card__btn"
          >
            {pickChatBusy ? '…' : 'Выбрать чат'}
          </motion.button>
        </div>
      </section>
    </div>
  );
}
