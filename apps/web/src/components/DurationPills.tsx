'use client';

import { motion } from 'framer-motion';
import { BAN_DURATIONS_MINUTES } from '@98plus/shared';

interface Props {
  value: number;
  onChange: (minutes: number) => void;
}

export function DurationPills({ value, onChange }: Props) {
  return (
    <section className="space-y-2">
      <p className="text-xs text-muted uppercase tracking-wider px-0.5">
        время
      </p>
      <div className="flex gap-2">
        {BAN_DURATIONS_MINUTES.map((m) => {
          const active = value === m;
          return (
            <motion.button
              key={m}
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={() => onChange(m)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                active
                  ? 'bg-accent text-white shadow-glow-sm border border-accent/50'
                  : 'bg-card/70 text-muted border border-white/8'
              }`}
            >
              {m}м
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}
