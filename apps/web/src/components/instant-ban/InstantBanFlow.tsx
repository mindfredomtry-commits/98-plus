'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  coerceFriendList,
  findFriendByUsername,
  type FriendCard,
} from '@98plus/shared';
import { useApp } from '../Providers';
import { useTelegram } from '@/hooks/useTelegram';
import { useSendChallenge } from '@/hooks/useSendChallenge';
import { safeResolveReceiverTarget } from '@/lib/resolve-receiver';
import { resolveDevSendTarget } from '@/lib/dev-receiver';
import { isClientDevAuthEnabled } from '@/lib/config';
import { shareBanViaTelegram } from '@/lib/first-challenge-share';
import { WhoScreen } from './WhoScreen';
import { WhatScreen } from './WhatScreen';
import { ConfirmScreen } from './ConfirmScreen';
import { SuccessScreen } from './SuccessScreen';
import './instant-ban.css';

const DEFAULT_DURATION_MINUTES = 3;

type Step = 'who' | 'what' | 'confirm' | 'success';

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
  const [sendError, setSendError] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);

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
    setSendError(null);
  }, []);

  const onSuccess = useCallback(() => {
    setSendError(null);
    setStep('success');
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
      rollbackOptimisticSend({
        username: p.username,
        message: p.message,
      });
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
      case 'success':
        return 'ЗАПРЕТ ОТПРАВЛЕН';
    }
  }, [step]);

  const handleSelectUser = useCallback((friend: FriendCard) => {
    setSelectedUser(friend);
    setBanText('');
    setSendError(null);
    setStep('what');
  }, []);

  const handleInvite = useCallback(async () => {
    if (!token || inviteBusy) return;
    setInviteBusy(true);
    try {
      // TODO: dedicated invite-only flow without ban text
      await shareBanViaTelegram({
        token,
        banText: 'играть',
        durationMinutes: DEFAULT_DURATION_MINUTES,
        afterShare: async () => {
          scheduleDeferredSync?.();
        },
      });
      haptic('light');
    } catch {
      // Placeholder — invite share requires ban text today
    } finally {
      setInviteBusy(false);
    }
  }, [token, inviteBusy, scheduleDeferredSync, haptic]);

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
        durationMinutes: DEFAULT_DURATION_MINUTES,
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
    haptic,
    safeFriends,
    user?.username,
    user?.id,
    send,
  ]);

  return (
    <div className="instant-ban-flow" role="dialog" aria-modal="true">
      <div className="instant-ban-flow__grid" aria-hidden />
      <div className="instant-ban-flow__inner">
        <h1 className="instant-ban-flow__title">{stepTitle}</h1>
        <div className="instant-ban-flow__body">
          {step === 'who' ? (
            <WhoScreen
              friends={safeFriends}
              onSelect={handleSelectUser}
              onInvite={() => void handleInvite()}
            />
          ) : null}
          {step === 'what' && selectedUser ? (
            <WhatScreen
              selectedUser={selectedUser}
              banText={banText}
              onChange={setBanText}
              onNext={() => setStep('confirm')}
              onBack={() => setStep('who')}
            />
          ) : null}
          {step === 'confirm' && selectedUser ? (
            <ConfirmScreen
              selectedUser={selectedUser}
              banText={banText}
              sending={inFlight || sharing}
              error={sendError}
              onConfirm={() => void executeSend()}
              onRetry={() => void executeSend()}
              onBack={() => setStep('what')}
            />
          ) : null}
          {step === 'success' && selectedUser ? (
            <SuccessScreen
              selectedUser={selectedUser}
              banText={banText}
              onAgain={resetForAnother}
              onReturn={onClose}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
