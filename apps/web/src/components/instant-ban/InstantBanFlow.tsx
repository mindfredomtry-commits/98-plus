'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  coerceFriendList,
  findFriendByUsername,
  type FriendCard,
} from '@98plus/shared';
import { useApp } from '../Providers';
import { useTelegram } from '@/hooks/useTelegram';
import { useSendChallenge } from '@/hooks/useSendChallenge';
import { useInstantBanViewport } from '@/hooks/useInstantBanViewport';
import { safeResolveReceiverTarget } from '@/lib/resolve-receiver';
import { resolveDevSendTarget } from '@/lib/dev-receiver';
import { isClientDevAuthEnabled } from '@/lib/config';
import { instantBanDebug, isInstantBanLiteMode } from '@/lib/instant-ban-debug';
import { resolveLobbyInfluencePercent } from '@/lib/lobby-influence';
import { shareInstantBanInviteMore } from '@/lib/share';
import { WhoScreen } from './WhoScreen';
import { WhatScreen } from './WhatScreen';
import { ConfirmScreen } from './ConfirmScreen';
import { SuccessScreen } from './SuccessScreen';
import type { PayoffAnchor } from './payoff-anchor';
import './instant-ban.css';

const DEFAULT_DURATION_MINUTES = 3;

type Step = 'who' | 'what' | 'confirm' | 'payoff' | 'success';

type Props = {
  onClose: () => void;
};

function triggerConfirmHaptic(): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(30);
    }
    const telegramHaptic = (
      window as Window & {
        Telegram?: {
          WebApp?: {
            HapticFeedback?: {
              notificationOccurred?: (type: 'error' | 'success' | 'warning') => void;
            };
          };
        };
      }
    ).Telegram?.WebApp?.HapticFeedback;
    telegramHaptic?.notificationOccurred?.('success');
  } catch {
    // no-op
  }
}

export function InstantBanFlow({ onClose }: Props) {
  const flowId = useId();
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  const {
    token,
    user,
    friends,
    reloadPending,
    reloadFriends,
    refreshUser,
    onboard,
    scheduleDeferredSync,
    applyOptimisticSend,
    confirmOptimisticSend,
    rollbackOptimisticSend,
  } = useApp();
  const { haptic } = useTelegram();

  const [step, setStep] = useState<Step>('who');
  const [selectedUser, setSelectedUser] = useState<FriendCard | null>(null);
  const [banText, setBanText] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(DEFAULT_DURATION_MINUTES);
  const [sendError, setSendError] = useState<string | null>(null);
  const [confirmEnterKey, setConfirmEnterKey] = useState(0);
  const [payoffAnchor, setPayoffAnchor] = useState<PayoffAnchor | null>(null);
  const sendCompleteRef = useRef(false);
  const payoffCompleteRef = useRef(false);

  useInstantBanViewport(step !== 'what');

  useEffect(() => {
    instantBanDebug('flow-mount', { flowId });
    return () => {
      instantBanDebug('flow-unmount', { flowId });
    };
  }, [flowId]);

  useEffect(() => {
    instantBanDebug('flow-render', {
      flowId,
      step,
      renderCount: renderCountRef.current,
    });
  });

  const safeFriends = useMemo(() => {
    try {
      return coerceFriendList(friends).filter(
        (f) => (f.username ?? '').toLowerCase() !== 'share',
      );
    } catch {
      return [];
    }
  }, [friends]);

  const resetForAnother = useCallback(() => {
    setStep('who');
    setSelectedUser(null);
    setBanText('');
    setDurationMinutes(DEFAULT_DURATION_MINUTES);
    setSendError(null);
    setPayoffAnchor(null);
    sendCompleteRef.current = false;
    payoffCompleteRef.current = false;
  }, []);

  const attemptSuccess = useCallback(() => {
    if (!sendCompleteRef.current || !payoffCompleteRef.current) return;
    sendCompleteRef.current = false;
    payoffCompleteRef.current = false;
    setStep('success');
  }, []);

  const onSuccess = useCallback(() => {
    setSendError(null);
    sendCompleteRef.current = true;
    attemptSuccess();
  }, [attemptSuccess]);

  const handlePayoffStart = useCallback((anchor: PayoffAnchor) => {
    setPayoffAnchor(anchor);
    setStep('payoff');
  }, []);

  const handlePayoffComplete = useCallback(() => {
    payoffCompleteRef.current = true;
    attemptSuccess();
  }, [attemptSuccess]);

  const { send, inFlight, sharing } = useSendChallenge({
    token,
    friends: safeFriends,
    onSuccess,
    onOptimisticApply: (p) => {
      applyOptimisticSend({
        username: p.username,
        firstName:
          findFriendByUsername(safeFriends, p.username)?.firstName ??
          p.username,
        banText: p.text,
        durationMinutes: p.durationMinutes,
      });
    },
    onConfirm: (p) => {
      confirmOptimisticSend(p.username);
    },
    onFail: (p) => {
      rollbackOptimisticSend({
        username: p.username,
        message: p.message,
      });
      sendCompleteRef.current = false;
      payoffCompleteRef.current = false;
      setPayoffAnchor(null);
      setStep('confirm');
      setSendError(p.message || 'Не получилось отправить запрет');
    },
    onboard,
    refreshUser,
    reloadPending,
    reloadFriends,
    scheduleDeferredSync,
  });

  const stepTitle = useMemo(() => {
    switch (step) {
      case 'who':
        return 'КОМУ ЗАПРЕЩАЕШЬ?';
      case 'what':
        return 'ЧТО ЗАПРЕЩАЕШЬ?';
      case 'confirm':
        return 'ПОДТВЕРДИ ЗАПРЕТ';
      case 'payoff':
        return 'ЗАПРЕТ ОТПРАВЛЕН';
      case 'success':
        return 'ЗАПРЕТ ОТПРАВЛЕН';
    }
  }, [step]);

  const handleSelectUser = useCallback((friend: FriendCard) => {
    setSelectedUser(friend);
    setBanText('');
    setDurationMinutes(DEFAULT_DURATION_MINUTES);
    setSendError(null);
    setStep('what');
  }, []);

  const handleWhatSubmit = useCallback((text: string, duration: number) => {
    setBanText(text);
    setDurationMinutes(duration);
    setConfirmEnterKey((k) => k + 1);
    setStep('confirm');
  }, []);

  const handleWhatBack = useCallback(() => {
    setStep('who');
  }, []);

  const handleConfirmBack = useCallback(() => {
    setStep('what');
  }, []);

  const handleInviteMore = useCallback(() => {
    shareInstantBanInviteMore(user?.username ?? null);
    haptic('light');
  }, [user?.username, haptic]);

  const executeSend = useCallback(async () => {
    if (!token || !selectedUser || inFlight || sharing) return;
    const text = banText.trim();
    if (text.length < 3) return;

    setSendError(null);
    triggerConfirmHaptic();
    haptic('medium');

    const username = (selectedUser.username ?? '').replace(/^@/, '').trim();
    if (!username) {
      setSendError('Не получилось отправить запрет');
      return;
    }

    const resolved = safeResolveReceiverTarget(username, safeFriends);
    const devTarget = resolveDevSendTarget(safeFriends, `@${username}`, {
      username: user?.username,
      userId: user?.id,
    });

    const sendTarget = devTarget ?? {
      receiverUsername: `@${username}`,
      receiverUserId: resolved.receiverUserId ?? selectedUser.userId ?? null,
      receiverTelegramId:
        resolved.receiverTelegramId ?? selectedUser.telegramId ?? null,
    };

    if (isClientDevAuthEnabled() && !sendTarget.receiverUserId) {
      setSendError('Выбери Dev Peer в списке людей');
      return;
    }

    try {
      await send({
        text,
        receiverUsername: sendTarget.receiverUsername.startsWith('@')
          ? sendTarget.receiverUsername
          : `@${sendTarget.receiverUsername}`,
        receiverUserId: sendTarget.receiverUserId,
        receiverTelegramId: sendTarget.receiverTelegramId,
        durationMinutes: durationMinutes,
      });
    } catch {
      /* onFail sets sendError */
    }
  }, [
    token,
    selectedUser,
    inFlight,
    sharing,
    banText,
    durationMinutes,
    haptic,
    safeFriends,
    user?.username,
    user?.id,
    send,
  ]);

  const lobbyInfluencePercent = useMemo(() => {
    const { influencePercent } = resolveLobbyInfluencePercent(user);
    return Math.min(100, Math.max(0, influencePercent));
  }, [user]);

  const liteMode = isInstantBanLiteMode();
  const whatMobileSafe = step === 'what';

  return (
    <div
      className={`instant-ban-flow${
        whatMobileSafe ? ' instant-ban-flow--what-mobile-safe' : ''
      }${liteMode ? ' instant-ban-debug-lite' : ''}`}
      role="dialog"
      aria-modal="true"
      data-instant-ban-view="InstantBanFlow"
      data-instant-ban-step={step}
    >
      <div className="instant-ban-flow__grid" aria-hidden />
      <div className="instant-ban-flow__inner">
        {step !== 'confirm' && step !== 'payoff' ? (
          <h1 className="instant-ban-flow__title">{stepTitle}</h1>
        ) : null}
        <div className="instant-ban-flow__body">
          {step === 'who' ? (
            <WhoScreen
              friends={safeFriends}
              onSelect={handleSelectUser}
              onInviteMore={handleInviteMore}
            />
          ) : null}
          {step === 'what' && selectedUser ? (
            <WhatScreen
              key={selectedUser.id ?? selectedUser.userId ?? selectedUser.username}
              selectedUser={selectedUser}
              initialBanText={banText}
              initialDurationMinutes={durationMinutes}
              onSubmit={handleWhatSubmit}
              onBack={handleWhatBack}
            />
          ) : null}
          {step === 'confirm' && selectedUser ? (
            <ConfirmScreen
              key={`confirm-${confirmEnterKey}-${selectedUser.id ?? selectedUser.userId ?? selectedUser.username}`}
              enterKey={confirmEnterKey}
              influencePercent={lobbyInfluencePercent}
              selectedUser={selectedUser}
              banText={banText}
              durationMinutes={durationMinutes}
              sending={inFlight || sharing}
              error={sendError}
              onConfirm={() => void executeSend()}
              onPayoffStart={handlePayoffStart}
              onRetry={() => void executeSend()}
              onBack={handleConfirmBack}
            />
          ) : null}
          {(step === 'payoff' || step === 'success') && selectedUser && payoffAnchor ? (
            <SuccessScreen
              morphAnchor={payoffAnchor}
              morphActive={step === 'payoff'}
              senderUser={user}
              selectedUser={selectedUser}
              banText={banText}
              durationMinutes={durationMinutes}
              onMorphComplete={handlePayoffComplete}
              onAgain={resetForAnother}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
