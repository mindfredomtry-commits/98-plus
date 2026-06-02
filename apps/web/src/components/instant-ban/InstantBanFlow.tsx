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
import {
  instantBanDebug,
  instantBanSendBeforeDebug,
  instantBanSendErrorDebug,
  isInstantBanLiteMode,
} from '@/lib/instant-ban-debug';
import { resolveLobbyInfluencePercent } from '@/lib/lobby-influence';
import { shareInstantBanInviteMore } from '@/lib/share';
import { WhoScreen } from './WhoScreen';
import { WhatScreen } from './WhatScreen';
import { ConfirmScreen } from './ConfirmScreen';
import './instant-ban.css';

const DEFAULT_DURATION_MINUTES = 3;

type Step = 'who' | 'what' | 'confirm';

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
  const [payoffArmToken, setPayoffArmToken] = useState(0);
  const sendSnapshotRef = useRef<{
    banText: string;
    selectedUser: FriendCard;
    durationMinutes: number;
  } | null>(null);
  const flowSendAttemptRef = useRef(false);
  const confirmSendContextRef = useRef<{
    payoffPhase: string;
    sendTriggered: boolean;
  }>({ payoffPhase: 'none', sendTriggered: false });
  const confirmAbortReleaseRef = useRef<(() => void) | null>(null);

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
    flowSendAttemptRef.current = false;
    sendSnapshotRef.current = null;
  }, []);

  const onSuccess = useCallback(() => {
    setSendError(null);
    setPayoffArmToken((t) => t + 1);
  }, []);

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
      flowSendAttemptRef.current = false;
      rollbackOptimisticSend({
        username: p.username,
        message: p.message,
      });
      const message = p.message || 'Не получилось отправить запрет';
      instantBanSendErrorDebug({
        message,
        error: p,
      });
      setSendError(message);
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
    flowSendAttemptRef.current = false;
    sendSnapshotRef.current = null;
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

  const handleSendContextChange = useCallback(
    (ctx: { payoffPhase: string; sendTriggered: boolean }) => {
      confirmSendContextRef.current = ctx;
    },
    [],
  );

  const handleBindAbortRelease = useCallback((abort: () => void) => {
    confirmAbortReleaseRef.current = abort;
  }, []);

  const executeSend = useCallback(async (): Promise<boolean> => {
    const snap = sendSnapshotRef.current;
    if (!snap) {
      instantBanDebug('send-skipped', { reason: 'no-snapshot' });
      return false;
    }

    const { banText: snapText, selectedUser: snapUser, durationMinutes: snapDuration } =
      snap;

    instantBanSendBeforeDebug({
      banText: snapText,
      selectedUserId: snapUser.id ?? snapUser.userId ?? snapUser.username ?? null,
      durationMinutes: snapDuration,
      payoffPhase: confirmSendContextRef.current.payoffPhase,
      sendTriggered: confirmSendContextRef.current.sendTriggered,
    });

    if (flowSendAttemptRef.current) {
      instantBanDebug('send-skipped', { reason: 'duplicate-flow-attempt' });
      return false;
    }

    if (!token) {
      setSendError('Не получилось отправить запрет');
      return false;
    }

    if (inFlight || sharing) {
      instantBanDebug('send-skipped', { reason: 'in-flight', inFlight, sharing });
      setSendError('Не получилось отправить запрет');
      return false;
    }

    const text = snapText.trim();
    if (text.length < 3) {
      setSendError('Не получилось отправить запрет');
      return false;
    }

    const username = (snapUser.username ?? '').replace(/^@/, '').trim();
    if (!username) {
      setSendError('Не получилось отправить запрет');
      return false;
    }

    flowSendAttemptRef.current = true;
    setSendError(null);
    triggerConfirmHaptic();
    haptic('medium');

    const resolved = safeResolveReceiverTarget(username, safeFriends);
    const devTarget = resolveDevSendTarget(safeFriends, `@${username}`, {
      username: user?.username,
      userId: user?.id,
    });

    const sendTarget = devTarget ?? {
      receiverUsername: `@${username}`,
      receiverUserId: resolved.receiverUserId ?? snapUser.userId ?? null,
      receiverTelegramId:
        resolved.receiverTelegramId ?? snapUser.telegramId ?? null,
    };

    if (isClientDevAuthEnabled() && !sendTarget.receiverUserId) {
      flowSendAttemptRef.current = false;
      setSendError('Выбери Dev Peer в списке людей');
      return false;
    }

    try {
      await send({
        text,
        receiverUsername: sendTarget.receiverUsername.startsWith('@')
          ? sendTarget.receiverUsername
          : `@${sendTarget.receiverUsername}`,
        receiverUserId: sendTarget.receiverUserId,
        receiverTelegramId: sendTarget.receiverTelegramId,
        durationMinutes: snapDuration,
      });
      return true;
    } catch (e) {
      instantBanSendErrorDebug({
        message: e instanceof Error ? e.message : String(e),
        error: e,
      });
      return true;
    }
  }, [
    token,
    inFlight,
    sharing,
    haptic,
    safeFriends,
    user?.username,
    user?.id,
    send,
  ]);

  const captureSendSnapshot = useCallback(() => {
    if (!selectedUser) return false;
    sendSnapshotRef.current = {
      banText,
      selectedUser,
      durationMinutes,
    };
    return true;
  }, [banText, selectedUser, durationMinutes]);

  const handleConfirmRelease = useCallback(async () => {
    if (!captureSendSnapshot()) {
      confirmAbortReleaseRef.current?.();
      return;
    }

    const started = await executeSend();
    if (!started) {
      flowSendAttemptRef.current = false;
      confirmAbortReleaseRef.current?.();
    }
  }, [captureSendSnapshot, executeSend]);

  const handleRetrySend = useCallback(async () => {
    flowSendAttemptRef.current = false;
    if (!captureSendSnapshot()) return;
    await executeSend();
  }, [captureSendSnapshot, executeSend]);

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
        {step !== 'confirm' ? (
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
              senderUser={user}
              selectedUser={selectedUser}
              banText={banText}
              durationMinutes={durationMinutes}
              sending={inFlight || sharing}
              error={sendError}
              payoffArmToken={payoffArmToken}
              onConfirm={() => void handleConfirmRelease()}
              onAgain={resetForAnother}
              onRetry={() => void handleRetrySend()}
              onBack={handleConfirmBack}
              onSendContextChange={handleSendContextChange}
              onBindAbortRelease={handleBindAbortRelease}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
