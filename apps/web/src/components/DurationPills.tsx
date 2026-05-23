'use client';

import { motion } from 'framer-motion';
import { BAN_DURATIONS_MINUTES } from '@98plus/shared';

interface Props {
  value: number;
  onChange: (minutes: number) => void;
  compact?: boolean;
}

export function DurationPills({ value, onChange, compact = false }: Props) {
  return (
    <section className={compact ? 'duration-pills--compact' : 'space-y-2'}>
      {!compact ? (
        <p className="text-xs text-muted uppercase tracking-wider px-0.5">
          время
        </p>
      ) : null}
      <div className="flex gap-1.5">
        {BAN_DURATIONS_MINUTES.map((m) => {
          const active = value === m;
          return (
            <motion.button
              key={m}
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={() => onChange(m)}
              className={`duration-pill flex-1 ${
                active ? 'duration-pill--active' : ''
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
