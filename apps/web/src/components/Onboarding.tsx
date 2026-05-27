'use client';

import { motion } from 'framer-motion';
import { SEED_BANS } from '@98plus/shared';
import { useApp } from './Providers';
import { BigButton } from './BigButton';

export function Onboarding() {
  const { onboard, setSendText, setSendOpen } = useApp();

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
      <p className="text-center text-muted text-sm">
        Отправь первый запрет — даже если друг ещё не в 98+
      </p>
      <div className="space-y-2">
        {SEED_BANS.slice(0, 5).map((text, i) => (
          <motion.button
            key={text}
            type="button"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            onClick={() => {
              setSendText(text);
              setSendOpen(true);
              onboard();
            }}
            className="w-full text-left bg-card rounded-2xl px-4 py-3 text-base border border-white/5 active:scale-[0.99]"
          >
            🚫 {text}
          </motion.button>
        ))}
      </div>
      <BigButton onClick={onboard}>Выбрать друга</BigButton>
    </motion.div>
  );
}
