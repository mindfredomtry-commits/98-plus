'use client';

import { memo, useMemo, useState, useCallback } from 'react';
import { coerceFriendList, findFriendByUsername } from '@98plus/shared';
import { safeResolveReceiverTarget } from '@/lib/resolve-receiver';
import { useApp } from './Providers';
import { useTelegram } from '@/hooks/useTelegram';
import { useSendChallenge } from '@/hooks/useSendChallenge';
import { GlowCTA } from './GlowCTA';
import { ctaLog } from '@/lib/cta-log';
import {
  sendFirstBanChallenge,
  shareBanViaTelegram,
} from '@/lib/first-challenge-share';

function safeCoerceFriends(input: unknown) {
  try {
    return coerceFriendList(input);
  } catch {
    return [];
  }
}

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
    showFirstBanOnboarding,
    completeFirstBan,
    setInlineBanError,
    triggerBanInputShake,
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
  const hasBan = challengeText.length >= 3;

  const ctaReady = showFirstBanOnboarding
    ? hasBan
    : hasBan;

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
    ctaError ?? (busy ? 'Подожди…' : sharing ? 'Выбери чат…' : undefined);

  function failBanValidation(): boolean {
    if (hasBan) return false;
    setInlineBanError('Сначала напиши запрет');
    triggerBanInputShake();
    setCtaError(null);
    haptic('light');
    return true;
  }

  async function zapretit() {
    setCtaError(null);

    ctaLog('press', {
      hasFriend,
      hasBan,
      selectedUsername,
      busy,
      hasToken: !!token,
      firstBan: showFirstBanOnboarding,
    });

    if (busy || sharing) {
      setCtaError('Подожди, отправляем…');
      return;
    }

    if (!token) {
      setCtaError('Перезапусти Mini App из Telegram');
      return;
    }

    if (failBanValidation()) return;

    haptic('medium');
    setInlineBanError(null);

    if (showFirstBanOnboarding) {
      try {
        await sendFirstBanChallenge({
          token,
          banText: challengeText,
          durationMinutes: sendDuration,
          afterShare: async () => {
            completeFirstBan();
            await onboard().catch(() => {});
            await refreshUser();
            await reloadPending();
            await reloadFriends();
          },
        });
        onSuccess();
      } catch (e) {
        setInlineBanError((e as Error).message || 'Не удалось отправить');
      }
      return;
    }

    if (!hasFriend) {
      try {
        await shareBanViaTelegram({
          token,
          banText: challengeText,
          durationMinutes: sendDuration,
          afterShare: async () => {
            await reloadFriends();
            await reloadPending();
          },
        });
        onSuccess();
      } catch (e) {
        setInlineBanError((e as Error).message || 'Не удалось отправить');
      }
      return;
    }

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
      setCtaError((e as Error).message || 'Не удалось отправить');
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
