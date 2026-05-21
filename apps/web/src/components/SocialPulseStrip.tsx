'use client';

import { motion } from 'framer-motion';
import type { FriendCard } from '@98plus/shared';
import { coerceFriendList } from '@98plus/shared';

interface Props {
  friends?: FriendCard[] | null;
  liveBans?: number;
}

export function SocialPulseStrip({ friends, liveBans = 0 }: Props) {
  const list = coerceFriendList(friends);
  const online = list.filter((f) => f.presence === 'online').length;
  const pressure = list.filter((f) => f.underPressure).length;
  const incoming = list.filter(
    (f) => f.challengeState === 'incoming_pending',
  ).length;

  const chips = [
    { icon: '🟢', label: 'онлайн', value: online || '—' },
    { icon: '😈', label: 'под давлением', value: pressure || '—' },
    { icon: '⚡', label: 'вызовов', value: liveBans },
    ...(incoming > 0
      ? [{ icon: '🔥', label: 'ждут тебя', value: incoming }]
      : []),
  ];

  return (
    <div className="scroll-x-strip flex gap-2 pb-1 -mx-0.5 px-0.5 snap-x">
      {chips.map((c, i) => (
        <motion.div
          key={c.label}
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.05 }}
          className="snap-start flex-shrink-0 glass-card px-3 py-2 border border-accent/15 flex items-center gap-2"
        >
          <span className="text-sm">{c.icon}</span>
          <div>
            <p className="text-[10px] text-muted leading-none">{c.label}</p>
            <p className="text-sm font-bold text-accent">{c.value}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
