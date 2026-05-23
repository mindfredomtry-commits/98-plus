'use client';

import { motion } from 'framer-motion';
import { normalizeBanTextForShare, type BanInteraction } from '@98plus/shared';
import { BanTimer } from './BanTimer';

interface Props {
  items: BanInteraction[];
  onOpen: (ban: BanInteraction) => void;
}

function statusLabel(b: BanInteraction) {
  if (b.status === 'pending') return 'ждёт';
  if (b.status === 'checking') return 'проверка';
  if (b.status === 'active') return 'идёт';
  return b.status;
}

export function ActiveChallenges({ items, onOpen }: Props) {
  const list = Array.isArray(items) ? items : [];
  const preview = list.slice(0, 8);

  return (
    <section className="space-y-2">
      <div className="flex justify-between items-center px-0.5">
        <p className="text-xs text-muted uppercase tracking-wider">
          активные вызовы
        </p>
        {list.length > 0 && (
          <span className="text-[10px] text-accent">{list.length}</span>
        )}
      </div>

      {preview.length === 0 ? (
        <div className="glass-card p-3 border border-accent/10 space-y-2">
          <p className="text-xs text-accent">⚡ арена ждёт первый вызов</p>
          <p className="text-[11px] text-muted">
            выбери человека сверху → запрет → «Запретить»
          </p>
        </div>
      ) : (
        <div
          className="scroll-x-strip flex gap-2 pb-1 snap-x snap-mandatory -mx-1 px-1"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {preview.map((b, i) => (
            <motion.button
              key={b?.id ?? `ban-${i}`}
              type="button"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onOpen(b)}
              className="flex-shrink-0 w-[168px] snap-start text-left glass-card p-3 border border-white/8 active:border-accent/40"
            >
              <div className="flex justify-between items-start gap-1 mb-1.5">
                <p className="text-[10px] text-muted truncate">
                  {b.isIncoming
                    ? `@${b.sender?.username ?? b.sender?.firstName ?? '—'}`
                    : `→ @${b.receiver?.username ?? b.receiver?.firstName ?? '—'}`}
                </p>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent/20 text-accent shrink-0">
                  {statusLabel(b)}
                </span>
              </div>
              <p className="text-sm font-medium line-clamp-2 leading-snug">
                {normalizeBanTextForShare(b.text ?? '') || b.text}
              </p>
              {b.remainingMs != null && (
                <div className="mt-2 text-[10px]">
                  <BanTimer remainingMs={b.remainingMs} />
                </div>
              )}
            </motion.button>
          ))}
        </div>
      )}
    </section>
  );
}
