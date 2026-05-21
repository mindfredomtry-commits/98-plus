'use client';

import { motion } from 'framer-motion';
import type { UserPublic } from '@98plus/shared';

export function EnergyBar({ user }: { user: UserPublic }) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted">⚡</span>
        <span className="text-sm font-medium text-accent text-glow">
          {user.auraLabel}
        </span>
      </div>
      <div className="h-2 rounded-full bg-card overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-accent/60 to-accent"
          initial={{ width: 0 }}
          animate={{ width: `${user.energyPercent}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          style={{ boxShadow: '0 0 12px rgba(155,89,182,0.5)' }}
        />
      </div>
    </div>
  );
}
