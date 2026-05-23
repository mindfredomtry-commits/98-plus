'use client';

import { useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { HOME_PRESET_BANS } from '@98plus/shared';
import { useTelegram } from '@/hooks/useTelegram';
import { PresetBanCards } from './PresetBanCards';
import { useApp } from './Providers';

const MAX_BAN_CHARS = 280;

interface Props {
  value: string;
  onChange: (text: string) => void;
  compact?: boolean;
}

export function ChallengeCompose({ value, onChange, compact = false }: Props) {
  const { haptic } = useTelegram();
  const { inlineBanError, banInputShake, setInlineBanError } = useApp();

  const presets = compact ? HOME_PRESET_BANS : undefined;

  const selectedPreset = useMemo(() => {
    const t = value.trim();
    if (!t) return null;
    const list = presets ?? [];
    return list.find((p) => p === t) ?? null;
  }, [value, presets]);

  const handlePreset = useCallback(
    (preset: string) => {
      haptic('light');
      setInlineBanError(null);
      onChange(preset);
    },
    [haptic, onChange, setInlineBanError],
  );

  const handleChange = useCallback(
    (text: string) => {
      if (text.trim().length >= 3) {
        setInlineBanError(null);
      }
      onChange(text);
    },
    [onChange, setInlineBanError],
  );

  return (
    <section
      className={`ban-compose ${compact ? 'ban-compose--compact' : ''}`}
      aria-label="Текст запрета"
    >
      <p className="ban-compose-title">ЧТО ТЫ ЗАПРЕЩАЕШЬ?</p>
      <label className="ban-textarea-wrap">
        <span className="sr-only">Текст запрета</span>
        <motion.textarea
          className={`ban-textarea ${banInputShake ? 'ban-textarea--shake' : ''} ${
            inlineBanError ? 'ban-textarea--error' : ''
          }`}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={compact ? 'Запрети что-нибудь...' : 'Запрещаю...'}
          rows={compact ? 2 : 3}
          maxLength={MAX_BAN_CHARS}
          autoComplete="off"
          autoCorrect="on"
          spellCheck
          enterKeyHint="done"
          animate={
            banInputShake
              ? { x: [0, -6, 6, -4, 4, 0] }
              : { x: 0 }
          }
          transition={{ duration: 0.45 }}
        />
      </label>
      {inlineBanError ? (
        <p className="ban-compose-error" role="status">
          {inlineBanError}
        </p>
      ) : null}
      <PresetBanCards
        selected={selectedPreset}
        onSelect={handlePreset}
        presets={presets}
        compact={compact}
      />
    </section>
  );
}
