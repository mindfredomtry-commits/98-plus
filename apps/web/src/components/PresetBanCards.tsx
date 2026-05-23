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
      className={`preset-chips ${compact ? 'preset-chips--compact' : ''} flex flex-wrap gap-1.5`}
    >
      {(Array.isArray(list) ? list : []).map((preset, i) => {
        const active = selected === preset;
        return (
          <motion.button
            key={preset}
            type="button"
            initial={compact ? false : { opacity: 0, scale: 0.92 }}
            animate={compact ? undefined : { opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.02 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => onSelect(preset)}
            className={`preset-chip ${compact ? 'preset-chip--compact' : ''} ${
              active ? 'preset-chip-active' : ''
            }`}
          >
            {!compact ? <span className="mr-1">🚫</span> : null}
            {preset}
          </motion.button>
        );
      })}
    </div>
  );
}
