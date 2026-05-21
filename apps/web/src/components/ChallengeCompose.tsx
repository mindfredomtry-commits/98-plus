'use client';

import { useCallback, useMemo } from 'react';
import { SEED_BANS } from '@98plus/shared';
import { useTelegram } from '@/hooks/useTelegram';
import { PresetBanCards } from './PresetBanCards';

const MAX_BAN_CHARS = 280;

interface Props {
  value: string;
  onChange: (text: string) => void;
}

export function ChallengeCompose({ value, onChange }: Props) {
  const { haptic } = useTelegram();

  const selectedPreset = useMemo(() => {
    const t = value.trim();
    if (!t) return null;
    return SEED_BANS.find((p) => p === t) ?? null;
  }, [value]);

  const handlePreset = useCallback(
    (preset: string) => {
      haptic('light');
      onChange(preset);
    },
    [haptic, onChange],
  );

  return (
    <section className="ban-compose" aria-label="Текст запрета">
      <p className="ban-compose-hint">Что ты запрещаешь?</p>
      <PresetBanCards selected={selectedPreset} onSelect={handlePreset} />
      <label className="ban-textarea-wrap">
        <span className="sr-only">Текст запрета</span>
        <textarea
          className="ban-textarea"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Напиши свой запрет..."
          rows={3}
          maxLength={MAX_BAN_CHARS}
          autoComplete="off"
          autoCorrect="on"
          spellCheck
          enterKeyHint="done"
        />
      </label>
    </section>
  );
}
