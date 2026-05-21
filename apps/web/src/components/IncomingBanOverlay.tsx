'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BAN_DURATIONS_MINUTES } from '@98plus/shared';
import type { BanInteraction, SessionState } from '@98plus/shared';
import { api, pingApi } from '@/lib/api';
import {
  formatDeliveryError,
  validateReplyTarget,
  verifyIncomingChallenge,
} from '@/lib/deliver-challenge';
import { challengeLog } from '@/lib/challenge-log';
import { acquireScrollLock, releaseScrollLock } from '@/lib/scroll-lock';
import { isValidIncomingOverlayPayload } from '@/lib/incoming-challenge';
import { useApp } from './Providers';
import { BigButton } from './BigButton';
import { useTelegram } from '@/hooks/useTelegram';
import { BanTimer } from './BanTimer';

function SenderAvatar({
  name,
  photoUrl,
}: {
  name: string;
  photoUrl: string | null;
}) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt=""
        className="w-20 h-20 rounded-3xl object-cover ring-2 ring-accent/50 shadow-glow-sm"
      />
    );
  }
  return (
    <div className="w-20 h-20 rounded-3xl bg-accent/25 flex items-center justify-center text-3xl font-black ring-2 ring-accent/40 shadow-glow-sm">
      {name[0]?.toUpperCase() ?? '?'}
    </div>
  );
}

function IncomingLoadingShell() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-bg flex flex-col items-center justify-center challenge-bg pointer-events-auto"
    >
      <div className="w-20 h-20 rounded-3xl bg-card/80 animate-pulse mb-4" />
      <p className="text-muted text-sm animate-pulse">тебя вызвали…</p>
    </motion.div>
  );
}

export function IncomingBanOverlay() {
  const {
    token,
    incomingBan,
    dismissIncoming,
    applySession,
    reloadFriends,
    onboard,
    setBanSentOpen,
  } = useApp();
  const { haptic, hapticSuccess, bindBack } = useTelegram();
  const [mode, setMode] = useState<'card' | 'counter'>('card');
  const [text, setText] = useState('');
  const [duration, setDuration] = useState<number>(10);
  const [loading, setLoading] = useState(false);
  const [bootReady, setBootReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [verifiedBan, setVerifiedBan] = useState<BanInteraction | null>(null);

  const safeDismiss = useCallback(
    (banId?: string, reason?: string) => {
      challengeLog('overlay:dismiss', { banId: banId ?? null, reason });
      dismissIncoming(banId);
    },
    [dismissIncoming],
  );

  const bootstrap = useCallback(async () => {
    if (!incomingBan?.id || !token) {
      setBootReady(false);
      setVerifiedBan(null);
      return;
    }

    if (!isValidIncomingOverlayPayload(incomingBan)) {
      safeDismiss(incomingBan.id, 'invalid-local-payload');
      return;
    }

    setBootError(null);
    setBootReady(false);

    try {
      const apiOk = await pingApi();
      if (!apiOk) {
        setBootError('Нет связи с API');
        return;
      }

      const ban = await verifyIncomingChallenge(token, incomingBan.id);
      if (!isValidIncomingOverlayPayload(ban)) {
        safeDismiss(incomingBan.id, 'resolved-on-server');
        return;
      }
      validateReplyTarget(ban);
      setVerifiedBan(ban);
      setBootReady(true);
      challengeLog('overlay:verified', { banId: ban.id });
    } catch (e) {
      setBootError(formatDeliveryError(e));
      setVerifiedBan(null);
    }
  }, [incomingBan, token, safeDismiss]);

  useEffect(() => {
    if (!incomingBan?.id) return;
    acquireScrollLock();
    challengeLog('overlay:mount', {
      banId: incomingBan.id,
      status: incomingBan.status,
    });
    return () => {
      releaseScrollLock();
      challengeLog('overlay:unmount', { banId: incomingBan.id });
    };
  }, [incomingBan?.id, incomingBan?.status]);

  useEffect(() => {
    if (!incomingBan || !token) return;
    if (!isValidIncomingOverlayPayload(incomingBan)) {
      safeDismiss(incomingBan.id, 'stale-incoming');
      return;
    }
    bootstrap();
    onboard().catch(() => {});
    return bindBack(() => {
      if (incomingBan.status === 'pending') return;
      safeDismiss(incomingBan.id, 'back-button');
    }, true);
  }, [incomingBan, token, bindBack, safeDismiss, onboard, bootstrap]);

  if (!incomingBan || !token || !isValidIncomingOverlayPayload(incomingBan)) {
    return null;
  }

  if (!verifiedBan || !isValidIncomingOverlayPayload(verifiedBan)) {
    return <IncomingLoadingShell />;
  }

  const ban = verifiedBan;
  const isPending = ban.status === 'pending';
  const senderLabel = ban.sender?.username
    ? `@${ban.sender.username}`
    : ban.sender?.firstName ?? '—';
  const canReply = bootReady && !bootError && !!ban.sender?.id;

  function finishWithSession(
    action: 'accept' | 'reject' | 'reply',
    banId: string,
    session?: SessionState,
  ) {
    challengeLog(`resolve:${action}`, { banId });
    safeDismiss(banId, action);
    setMode('card');
    setText('');
    setVerifiedBan(null);
    setBootReady(false);
    if (session) {
      challengeLog('session:apply-after-resolve', {
        incoming: session.incoming?.id ?? null,
        incomingStatus: session.incoming?.status ?? null,
      });
      applySession(session);
    }
  }

  async function handleAccept() {
    if (!ban.id || !token) return;
    setLoading(true);
    hapticSuccess();
    try {
      const res = await api<{ ban?: BanInteraction; session?: SessionState }>(
        `/bans/${ban.id}/accept`,
        { method: 'POST', token },
      );
      finishWithSession('accept', ban.id, res.session);
    } catch (e) {
      alert(formatDeliveryError(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleReject() {
    if (!ban.id || !token) return;
    setLoading(true);
    haptic('light');
    try {
      const res = await api<{ ok?: boolean; session?: SessionState }>(
        `/bans/${ban.id}/reject`,
        { method: 'POST', token },
      );
      finishWithSession('reject', ban.id, res.session);
    } catch (e) {
      alert(formatDeliveryError(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleReplyBan() {
    if (!token || !canReply || !text.trim() || !ban.id) return;
    setLoading(true);
    haptic('medium');
    try {
      validateReplyTarget(ban);

      const res = await api<{
        parentId: string;
        replyBan?: BanInteraction;
        session: SessionState;
      }>(`/bans/${ban.id}/reply`, {
        method: 'POST',
        token,
        body: JSON.stringify({
          text: text.trim(),
          durationMinutes: duration,
        }),
      });

      challengeLog('reply:success', {
        parentId: res.parentId,
        replyBanId: res.replyBan?.id ?? null,
      });
      finishWithSession('reply', ban.id, res.session);
      await reloadFriends();
      setBanSentOpen(true);
    } catch (e) {
      alert(formatDeliveryError(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-bg flex flex-col challenge-bg pointer-events-auto"
      >
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="mb-5"
          >
            <SenderAvatar
              name={ban.sender?.firstName ?? '—'}
              photoUrl={ban.sender?.photoUrl ?? null}
            />
          </motion.div>
          <p className="text-accent text-sm font-medium mb-2">тебя вызвали</p>
          <p className="text-muted text-sm mb-4">{senderLabel}</p>
          <motion.p
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="text-2xl font-bold leading-snug max-w-sm"
          >
            {ban.text ?? ''}
          </motion.p>
          {isPending && (
            <p className="text-xs text-muted mt-3">
              ⏱ {ban.durationMinutes ?? 0} мин после принятия
            </p>
          )}
          {ban.remainingMs != null && (
            <div className="mt-4">
              <BanTimer remainingMs={ban.remainingMs} />
            </div>
          )}
          {bootError && (
            <p className="text-warning text-xs mt-4 max-w-xs">{bootError}</p>
          )}
          {!bootReady && !bootError && (
            <p className="text-muted text-xs mt-4 animate-pulse">
              подключаем арену…
            </p>
          )}
        </div>

        <div
          className="p-4 space-y-3"
          style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
        >
          {mode === 'card' ? (
            <>
              {isPending && (
                <>
                  <BigButton onClick={handleAccept} disabled={loading || !bootReady}>
                    ✅ Принять
                  </BigButton>
                  <BigButton
                    variant="ghost"
                    onClick={handleReject}
                    disabled={loading || !bootReady}
                  >
                    Отклонить
                  </BigButton>
                </>
              )}
              <BigButton
                onClick={() => setMode('counter')}
                disabled={loading || !canReply}
              >
                🚫 Запретить в ответ
              </BigButton>
            </>
          ) : (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Твой запрет..."
                disabled={!canReply || loading}
                className="w-full bg-card rounded-2xl p-4 text-lg min-h-[88px] resize-none outline-none focus:ring-2 focus:ring-accent/50 border border-white/5 disabled:opacity-50"
                autoFocus
              />
              <div className="flex gap-2">
                {BAN_DURATIONS_MINUTES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    disabled={loading}
                    onClick={() => setDuration(m)}
                    className={`flex-1 py-2 rounded-xl text-sm ${
                      duration === m
                        ? 'bg-accent text-white shadow-glow-sm'
                        : 'bg-card text-muted'
                    }`}
                  >
                    {m}м
                  </button>
                ))}
              </div>
              <BigButton
                onClick={handleReplyBan}
                disabled={loading || !text.trim() || !canReply}
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                    Отправляем…
                  </span>
                ) : (
                  '🚫 Запретить'
                )}
              </BigButton>
              <button
                type="button"
                onClick={() => setMode('card')}
                className="w-full text-muted text-sm py-2"
                disabled={loading}
              >
                Назад
              </button>
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
