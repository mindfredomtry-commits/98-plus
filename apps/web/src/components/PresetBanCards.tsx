'use client';

import { motion } from 'framer-motion';
import { SEED_BANS } from '@98plus/shared';

interface Props {
  selected: string | null;
  onSelect: (preset: string) => void;
  presets?: readonly string[];
  compact?: boolean;
}

export function PresetBanCards({
  selected,
  onSelect,
  presets,
  compact = false,
}: Props) {
  const list = presets ?? SEED_BANS;

  return (
    <div
      className={`preset-chips ${compact ? 'preset-chips--home' : ''} flex flex-wrap justify-center`}
    >
      {(Array.isArray(list) ? list : []).map((preset) => {
        const active = selected === preset;
        return (
          <motion.button
            key={preset}
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={() => onSelect(preset)}
            className={`preset-chip ${compact ? 'preset-chip--home' : ''} ${
              active ? 'preset-chip-active' : ''
            }`}
          >
            <span className="preset-chip__icon" aria-hidden>
              🚫
            </span>
            <span className="preset-chip__label">{preset}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
