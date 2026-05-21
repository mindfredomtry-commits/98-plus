'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SYSTEM_VOICE } from '@98plus/shared';
import type { BanResult } from '@98plus/shared';
import { api } from '@/lib/api';
import { useApp } from './Providers';
import { BigButton } from './BigButton';
import { useTelegram } from '@/hooks/useTelegram';
import { BanTimer } from './BanTimer';
import { challengeLog } from '@/lib/challenge-log';

export function CheckOverlay() {
  const {
    token,
    checkBan,
    checkWaiting,
    setCheckWaiting,
    setResult,
    refreshUser,
    clearCheckOverlay,
  } = useApp();
  const { haptic } = useTelegram();
  const [submitting, setSubmitting] = useState(false);

  if (!checkBan?.id || !token || checkBan.status !== 'checking') {
    return null;
  }

  async function answer(completed: boolean) {
    haptic('light');
    setSubmitting(true);
    try {
      const res = await api<{
        done: boolean;
        waiting?: boolean;
        result?: BanResult;
      }>(`/bans/${checkBan!.id}/check`, {
        method: 'POST',
        token,
        body: JSON.stringify({ completed }),
      });

      if (res.done && res.result) {
        challengeLog('check:done', { banId: checkBan!.id });
        clearCheckOverlay();
        setResult(res.result);
        await refreshUser();
      } else if (res.waiting) {
        challengeLog('check:waiting-ui', { banId: checkBan!.id });
        setCheckWaiting(true);
        window.setTimeout(() => {
          clearCheckOverlay();
        }, 3000);
      }
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const showTransientWaiting = checkWaiting;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={showTransientWaiting ? 'wait' : 'form'}
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-x-4 z-[45] bg-card rounded-3xl p-6 shadow-glow border border-accent/20 above-bottom-chrome pointer-events-auto"
      >
        {showTransientWaiting ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-center py-4"
          >
            <motion.p
              animate={{ opacity: [0.7, 1, 0.7] }}
              transition={{ repeat: Infinity, duration: 1.4 }}
              className="text-accent font-medium mb-2"
            >
              ⚡ Ждём друга
            </motion.p>
            <p className="text-muted text-sm">Ответ учтён. Скоро результат.</p>
          </motion.div>
        ) : (
          <>
            <div className="flex justify-between items-start mb-2">
              <p className="text-accent font-medium">{SYSTEM_VOICE.checkPrompt}</p>
              <BanTimer remainingMs={checkBan.remainingMs} />
            </div>
            <p className="text-lg mb-6">«{checkBan.text ?? ''}»</p>
            <div className="space-y-3">
              <BigButton onClick={() => answer(true)} disabled={submitting}>
                ✅ Выполнил
              </BigButton>
              <BigButton
                variant="ghost"
                onClick={() => answer(false)}
                disabled={submitting}
              >
                ❌ Не выполнил
              </BigButton>
            </div>
          </>
        )}
        <button
          type="button"
          onClick={clearCheckOverlay}
          className="w-full text-muted text-xs py-3 mt-2"
        >
          Закрыть
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
