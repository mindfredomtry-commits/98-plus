'use client';

import { motion } from 'framer-motion';
import { isIncomingOverlayBan, type BanInteraction } from '@98plus/shared';
import { BanTimer } from './BanTimer';
import { useApp } from './AppContext';

export function InteractionList() {
  const { activeBans, setCheckBan, setIncomingBan } = useApp();
  const items = Array.isArray(activeBans) ? activeBans : [];

  if (items.length === 0) {
    return (
      <p className="text-center text-muted text-sm py-6">
        Пока тихо. Отправь первый запрет.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((b, i) => (
        <motion.button
          key={b?.id ?? `ban-${i}`}
          type="button"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04 }}
          onClick={() => {
            if (!b?.id) return;
            if (isIncomingOverlayBan(b) && b.sender?.id) {
              setIncomingBan(b);
            } else if (b.status === 'checking') {
              setCheckBan(b);
            }
          }}
          className="w-full text-left bg-card rounded-2xl px-4 py-3 border border-white/5 active:scale-[0.99] transition-transform"
        >
          <div className="flex justify-between items-center mb-1">
            <p className="text-sm text-muted">
              {b.isIncoming
                ? `от ${b.sender?.firstName ?? b.sender?.username ?? '—'}`
                : `→ ${b.receiver?.firstName ?? b.receiver?.username ?? '—'}`}
            </p>
            <BanTimer remainingMs={b.remainingMs} />
          </div>
          <p className="font-medium truncate">🚫 {b.text ?? ''}</p>
        </motion.button>
      ))}
    </div>
  );
}
