'use client';

import { motion } from 'framer-motion';
import type { FriendCard, UserPublic } from '@98plus/shared';
import { coerceFriendList } from '@98plus/shared';

interface Props {
  user: UserPublic;
  liveCount: number;
  friends?: FriendCard[] | null;
}

export function CompactArenaHeader({ user, liveCount, friends }: Props) {
  const list = coerceFriendList(friends);
  const online = list.filter((f) => f.presence === 'online').length;
  const pressure = list.filter((f) => f.underPressure).length;
  const energyPercent = user?.energyPercent ?? 0;
  const streak = user?.streak ?? 0;

  const stats = [
    { icon: '🟢', label: 'онлайн', value: online || '—' },
    { icon: '😈', label: 'давление', value: pressure || '—' },
    { icon: '⚡', label: 'вызовов', value: liveCount },
  ];

  return (
    <header className="compact-arena-header">
      <div className="compact-arena-header__row">
        <div>
          <h1 className="compact-arena-header__logo">98+</h1>
          <p className="compact-arena-header__sub">
            {liveCount > 0 ? (
              <span className="text-accent">
                {liveCount} активн{liveCount === 1 ? 'ый' : 'ых'} вызов
              </span>
            ) : (
              'арена открыта'
            )}
          </p>
        </div>
        <div className="compact-arena-header__meta">
          <span>🔥 {streak}</span>
          <span className="text-accent">⚡ {energyPercent}%</span>
        </div>
      </div>

      <div className="compact-arena-header__energy">
        <div className="compact-arena-header__energy-bar">
          <motion.div
            className="compact-arena-header__energy-fill"
            initial={{ width: 0 }}
            animate={{ width: `${energyPercent}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
      </div>

      <div className="compact-arena-header__stats scroll-x-strip">
        {stats.map((s, i) => (
          <div key={s.label} className="compact-stat-chip">
            <span>{s.icon}</span>
            <span className="compact-stat-chip__val">{s.value}</span>
            <span className="compact-stat-chip__lbl">{s.label}</span>
          </div>
        ))}
      </div>
    </header>
  );
}
