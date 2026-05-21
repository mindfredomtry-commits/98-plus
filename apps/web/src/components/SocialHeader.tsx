'use client';

import { motion } from 'framer-motion';
import type { UserPublic } from '@98plus/shared';

interface Props {
  user: UserPublic;
  liveCount: number;
}

export function SocialHeader({ user, liveCount }: Props) {
  const streak = user?.streak ?? 0;
  const energyPercent = user?.energyPercent ?? 0;
  const auraLabel = user?.auraLabel ?? '—';

  return (
    <header className="mb-5">
      <div className="flex justify-between items-start gap-3">
        <div>
          <h1 className="text-3xl font-black text-glow tracking-tight">98+</h1>
          <p className="text-[11px] text-muted mt-0.5">
            {liveCount > 0 ? (
              <span className="text-accent">
                {liveCount} активн{liveCount === 1 ? 'ый' : 'ых'} вызов
              </span>
            ) : (
              'арена открыта'
            )}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 min-w-[120px]">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted">🔥</span>
            <span className="font-bold text-white">{streak}</span>
            <span className="text-muted/60">серия</span>
          </div>
          <span className="text-[10px] text-accent font-medium">{auraLabel}</span>
        </div>
      </div>

      <div className="mt-4 glass-card p-3 space-y-2">
        <div className="flex justify-between text-[10px] text-muted uppercase tracking-wider">
          <span>давление</span>
          <span>⚡ {energyPercent}%</span>
        </div>
        <div className="h-2.5 rounded-full bg-black/40 overflow-hidden border border-white/5">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-violet-600 via-accent to-fuchsia-500"
            initial={{ width: 0 }}
            animate={{ width: `${energyPercent}%` }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            style={{ boxShadow: '0 0 14px rgba(155,89,182,0.55)' }}
          />
        </div>
        <div className="flex justify-between text-[10px]">
          <span className="text-muted">социальная энергия</span>
          <motion.span
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{ repeat: Infinity, duration: 2.5 }}
            className="text-accent"
          >
            live
          </motion.span>
        </div>
      </div>
    </header>
  );
}
