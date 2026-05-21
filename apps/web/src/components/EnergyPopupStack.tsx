'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { EnergyPopup } from '@98plus/shared';

export function EnergyPopupStack({ popups }: { popups: EnergyPopup[] }) {
  return (
    <div className="fixed top-20 left-0 right-0 z-[35] flex flex-col items-center gap-2 pointer-events-none px-4">
      <AnimatePresence>
        {popups.map((p) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: -12, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20 }}
            className={`px-5 py-3 rounded-2xl font-bold text-lg shadow-glow ${
              p.delta < 0
                ? 'bg-warning/20 text-warning animate-shake'
                : 'bg-accent/25 text-accent'
            }`}
          >
            {p.message && (
              <p className="text-xs font-normal mb-1 opacity-80">{p.message}</p>
            )}
            <span>
              {p.delta > 0 ? '+' : ''}
              {p.delta} ⚡
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
