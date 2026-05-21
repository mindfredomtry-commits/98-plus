'use client';

import { memo, useMemo, useState, useCallback } from 'react';
import { coerceFriendList, findFriendByUsername } from '@98plus/shared';

function safeCoerceFriends(input: unknown) {
  try {
    return coerceFriendList(input);
  } catch {
    return [];
  }
}
import { safeResolveReceiverTarget } from '@/lib/resolve-receiver';
import { useApp } from './Providers';
import { useTelegram } from '@/hooks/useTelegram';
import { useSendChallenge } from '@/hooks/useSendChallenge';
import { GlowCTA } from './GlowCTA';
import { ctaLog } from '@/lib/cta-log';

interface Props {
  visible?: boolean;
}

function SendBanDockInner({ visible = true }: Props) {
  const {
    token,
    friends,
    sendReceiver,
    sendText,
    sendDuration,
    refreshUser,
    reloadPending,
    reloadFriends,
    onboard,
    setBanSentOpen,
    notifySendSuccess,
  } = useApp();
  const { haptic } = useTelegram();
  const [ctaError, setCtaError] = useState<string | null>(null);

  const safeFriends = useMemo(
    () => safeCoerceFriends(friends),
    [friends],
  );

  const onSuccess = useCallback(() => {
    setCtaError(null);
    setBanSentOpen(true);
  }, [setBanSentOpen]);

  const { send, busy, sharing } = useSendChallenge({
    token,
    friends: safeFriends,
    onSuccess,
    onboard,
    refreshUser,
    reloadPending,
    reloadFriends,
  });

  const selectedUsername = useMemo(
    () => sendReceiver?.replace(/^@/, '').trim().toLowerCase() ?? '',
    [sendReceiver],
  );
  const selectedFriend = useMemo(
    () => findFriendByUsername(safeFriends, selectedUsername),
    [safeFriends, selectedUsername],
  );
  const hasFriend = Boolean(selectedUsername);
  const challengeText = sendText?.trim() ?? '';
  const hasBan = challengeText.length > 0;
  const ctaReady = hasFriend && hasBan;

  const resolved = useMemo(() => {
    if (!selectedUsername) {
      return safeResolveReceiverTarget('');
    }
    return safeResolveReceiverTarget(selectedUsername, safeFriends);
  }, [selectedUsername, safeFriends]);

  const label = sharing
    ? 'Выбери чат в Telegram…'
    : busy
      ? 'Отправляем…'
      : '🚫 Запретить';

  const helperText =
    ctaError ??
    (!ctaReady && !busy && !sharing
      ? !hasFriend
        ? 'выбери человека'
        : !hasBan
          ? 'Что ты запрещаешь?'
          : '\u00a0'
      : '\u00a0');

  async function zapretit() {
    setCtaError(null);

    ctaLog('press', {
      hasFriend,
      hasBan,
      selectedUsername,
      busy,
      hasToken: !!token,
    });

    if (busy || sharing) {
      setCtaError('Подожди, отправляем…');
      return;
    }

    if (!token) {
      const msg = 'Нет авторизации — перезапусти Mini App из Telegram';
      setCtaError(msg);
      alert(msg);
      return;
    }

    const missing: string[] = [];
    if (!hasFriend) missing.push('человека');
    if (!hasBan) missing.push('запрет');
    if (missing.length > 0) {
      setCtaError(
        !hasBan && hasFriend
          ? 'Что ты запрещаешь?'
          : `Выбери: ${missing.join(', ')}`,
      );
      haptic('light');
      return;
    }

    haptic('medium');

    try {
      await send({
        text: challengeText,
        receiverUsername: sendReceiver,
        receiverUserId:
          resolved.receiverUserId ?? selectedFriend?.userId ?? null,
        receiverTelegramId:
          resolved.receiverTelegramId ?? selectedFriend?.telegramId ?? null,
        durationMinutes: sendDuration,
      });
      notifySendSuccess(
        sendReceiver,
        selectedFriend?.firstName ?? selectedUsername,
      );
    } catch (e) {
      const msg = (e as Error).message || 'Не удалось отправить';
      setCtaError(msg);
      alert(msg);
    }
  }

  return (
    <div
      className={`cta-dock ${visible ? '' : 'cta-dock--off'}`}
      role="region"
      aria-label="Отправить запрет"
      aria-hidden={!visible}
    >
      <div className="cta-dock-inner">
        <GlowCTA
          onClick={zapretit}
          ready={ctaReady}
          busy={busy || sharing}
          helperText={helperText}
        >
          {label}
        </GlowCTA>
      </div>
    </div>
  );
}

export const SendBanDock = memo(SendBanDockInner);
