'use client';

import { motion } from 'framer-motion';
import { SEED_BANS } from '@98plus/shared';

interface Props {
  selected: string | null;
  onSelect: (preset: string) => void;
}

export function PresetBanCards({ selected, onSelect }: Props) {
  return (
    <div className="preset-chips flex flex-wrap gap-2">
        {(Array.isArray(SEED_BANS) ? SEED_BANS : []).map((preset, i) => {
          const active = selected === preset;
          return (
            <motion.button
              key={preset}
              type="button"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.03 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => onSelect(preset)}
              className={`preset-chip text-left text-sm px-3.5 py-2.5 rounded-2xl border transition-all ${
                active
                  ? 'preset-chip-active border-accent/60 text-white'
                  : 'border-white/8 bg-card/60 text-muted hover:border-accent/30'
              }`}
            >
              <span className="mr-1">🚫</span>
              {preset}
            </motion.button>
          );
        })}
    </div>
  );
}
