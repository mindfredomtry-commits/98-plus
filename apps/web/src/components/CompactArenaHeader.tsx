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

  const stats = [
    { icon: '🟢', label: 'онлайн', value: online || '—' },
    { icon: '😈', label: 'давление', value: pressure || '—' },
    { icon: '⚡', label: 'вызовов', value: liveCount },
  ];

  return (
    <header className="compact-arena-header">
      <div className="compact-arena-header__top">
        <h1 className="compact-arena-header__logo">98+</h1>
        <div className="compact-arena-header__energy-col">
          <span className="compact-arena-header__energy-label">
            социальная энергия
          </span>
          <div className="compact-arena-header__energy-bar">
            <motion.div
              className="compact-arena-header__energy-fill"
              initial={false}
              animate={{ width: `${energyPercent}%` }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
            />
          </div>
        </div>
        <span className="compact-arena-header__pct">⚡ {energyPercent}%</span>
      </div>

      <div className="compact-arena-header__stats">
        {stats.map((s) => (
          <div key={s.label} className="compact-stat-chip">
            <span className="compact-stat-chip__icon">{s.icon}</span>
            <span className="compact-stat-chip__lbl">{s.label}</span>
            <span className="compact-stat-chip__val">{s.value}</span>
          </div>
        ))}
      </div>
    </header>
  );
}
