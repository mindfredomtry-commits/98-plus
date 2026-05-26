'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BAN_DURATIONS_MINUTES, SEED_BANS } from '@98plus/shared';
import type { SessionState } from '@98plus/shared';
import { api } from '@/lib/api';
import { formatDeliveryError } from '@/lib/deliver-challenge';
import { acknowledgeIncomingOptimistic } from '@/lib/incoming-ack-flow';
import { useApp } from './Providers';
import { BigButton } from './BigButton';
import { useTelegram } from '@/hooks/useTelegram';
import { useSendChallenge } from '@/hooks/useSendChallenge';
import { FriendPicker } from './FriendPicker';

export function SendBanSheet() {
  const {
    token,
    friends,
    sendOpen,
    setSendOpen,
    sendReceiver,
    setSendReceiver,
    sendText,
    setSendText,
    refreshUser,
    reloadPending,
    reloadFriends,
    onboard,
    setBanSentOpen,
    incomingReplyBanId,
    clearIncomingReply,
    applySession,
    reloadFriends,
  } = useApp();
  const { haptic, bindBack } = useTelegram();
  const [duration, setDuration] = useState(10);
  const isReplyFlow = !!incomingReplyBanId;

  const onSuccess = () => {
    setSendOpen(false);
    setSendText('');
    setSendReceiver('');
    clearIncomingReply();
    setBanSentOpen(true);
  };

  const { send, busy, sharing } = useSendChallenge({
    token,
    friends,
    onSuccess,
    onboard,
    refreshUser,
    reloadPending,
    reloadFriends,
  });

  useEffect(() => {
    if (!sendOpen) return;
    return bindBack(() => setSendOpen(false), true);
  }, [sendOpen, bindBack, setSendOpen]);

  useEffect(() => {
    if (!sendOpen) clearIncomingReply();
  }, [sendOpen, clearIncomingReply]);

  async function zapretit() {
    if (!token || !sendText.trim() || !sendReceiver.trim()) return;
    haptic('medium');
    try {
      if (incomingReplyBanId) {
        const res = await api<{
          parentId: string;
          session: SessionState;
        }>(`/bans/${incomingReplyBanId}/reply`, {
          method: 'POST',
          token,
          body: JSON.stringify({
            text: sendText.trim(),
            durationMinutes: duration,
          }),
        });
        acknowledgeIncomingOptimistic(incomingReplyBanId);
        if (res.session) applySession(res.session);
        await reloadFriends();
        onSuccess();
        return;
      }
      await send({
        text: sendText,
        receiverUsername: sendReceiver,
        durationMinutes: duration,
      });
    } catch (e) {
      alert(formatDeliveryError(e));
    }
  }

  return (
    <AnimatePresence>
      {sendOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-40 bg-black/90 flex flex-col justify-end backdrop-blur-sm"
          onClick={() => !busy && setSendOpen(false)}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="sheet-gradient rounded-t-3xl p-5 max-h-[90dvh] overflow-y-auto space-y-3 border-t border-accent/20"
            style={{
              paddingBottom: 'max(2rem, env(safe-area-inset-bottom))',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-center text-sm text-muted">
              {isReplyFlow ? 'Запрет в ответ' : 'Кого вызываешь?'}
            </p>

            {isReplyFlow ? (
              <p className="text-center text-lg font-semibold text-white py-1">
                {sendReceiver}
              </p>
            ) : (
              token && (
                <FriendPicker
                  token={token}
                  value={sendReceiver}
                  onChange={setSendReceiver}
                  friends={friends}
                />
              )
            )}

            <div className="flex flex-wrap gap-2">
              {SEED_BANS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() =>
                    setSendText(preset)
                  }
                  className="text-xs bg-bg/80 px-3 py-1.5 rounded-full text-muted border border-white/5 active:border-accent/40"
                >
                  {preset}
                </button>
              ))}
            </div>
            <textarea
              value={sendText}
              onChange={(e) => setSendText(e.target.value)}
              placeholder="Запрещаю..."
              className="w-full bg-bg/90 rounded-2xl p-4 text-lg min-h-[72px] resize-none outline-none focus:ring-2 focus:ring-accent/50 border border-white/5"
            />
            <div className="flex gap-2">
              {BAN_DURATIONS_MINUTES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDuration(m)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                    duration === m
                      ? 'bg-accent shadow-glow-sm text-white'
                      : 'bg-bg text-muted border border-white/5'
                  }`}
                >
                  {m}м
                </button>
              ))}
            </div>

            <BigButton
              onClick={zapretit}
              disabled={busy || !sendReceiver.trim() || !sendText.trim()}
              className="animate-pulse-glow"
            >
              {sharing ? 'Отправь в Telegram…' : busy ? '…' : '🚫 Запретить'}
            </BigButton>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
