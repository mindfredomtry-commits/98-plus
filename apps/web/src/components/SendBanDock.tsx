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
import { resolveDevSendTarget } from '@/lib/dev-receiver';
import { isClientDevAuthEnabled } from '@/lib/config';

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
    user,
    sendReceiver,
    sendText,
    sendDuration,
    refreshUser,
    reloadPending,
    reloadFriends,
    onboard,
    setBanSentOpen,
    applyOptimisticSend,
    confirmOptimisticSend,
    rollbackOptimisticSend,
    showFirstBanOnboarding,
    completeFirstBan,
    setInlineBanError,
    triggerBanInputShake,
  } = useApp();
  const { haptic } = useTelegram();
  const [sendInlineError, setSendInlineError] = useState<string | null>(null);

  const safeFriends = useMemo(
    () => safeCoerceFriends(friends),
    [friends],
  );

  const onSuccess = useCallback(() => {
    setSendInlineError(null);
    setBanSentOpen(true);
  }, [setBanSentOpen]);

  const { send, sharing, inFlight } = useSendChallenge({
    token,
    friends: safeFriends,
    onSuccess,
    onOptimisticApply: (p) => {
      setSendInlineError(null);
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
    onRequiresShare: () => {
      setBanSentOpen(false);
    },
    onFail: (p) => {
      setBanSentOpen(false);
      const isTimeout = p.message.includes('тормозит');
      rollbackOptimisticSend({
        username: p.username,
        message: p.message,
      });
      setSendInlineError(
        isTimeout
          ? p.message
          : p.message && p.message !== 'Не удалось отправить вызов'
            ? p.message
            : 'Не отправилось. Повторить?',
      );
    },
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

  const ctaReady = showFirstBanOnboarding ? hasBan : hasBan;

  const resolved = useMemo(() => {
    if (!selectedUsername) {
      return safeResolveReceiverTarget('');
    }
    return safeResolveReceiverTarget(selectedUsername, safeFriends);
  }, [selectedUsername, safeFriends]);

  const label = sharing ? 'Выбери чат в Telegram…' : '🚫 Запретить';

  const helperText =
    sendInlineError ?? (sharing ? 'Выбери чат в Telegram…' : undefined);

  function failBanValidation(): boolean {
    if (hasBan) return false;
    setInlineBanError('Сначала напиши запрет');
    triggerBanInputShake();
    setSendInlineError(null);
    haptic('light');
    return true;
  }

  async function zapretit() {
    setSendInlineError(null);

    ctaLog('press', {
      hasFriend,
      hasBan,
      selectedUsername,
      inFlight,
      hasToken: !!token,
      firstBan: showFirstBanOnboarding,
    });

    if (inFlight || sharing) return;

    if (!token) {
      setSendInlineError('Перезапусти Mini App из Telegram');
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

    const devTarget = resolveDevSendTarget(safeFriends, sendReceiver, {
      username: user?.username,
      userId: user?.id,
    });

    const sendTarget = devTarget ?? {
      receiverUsername: sendReceiver,
      receiverUserId:
        resolved.receiverUserId ?? selectedFriend?.userId ?? null,
      receiverTelegramId:
        resolved.receiverTelegramId ?? selectedFriend?.telegramId ?? null,
    };

    if (isClientDevAuthEnabled() && !sendTarget.receiverUserId) {
      setSendInlineError('Выбери Dev Peer в списке людей');
      return;
    }

    void send({
      text: challengeText,
      receiverUsername: sendTarget.receiverUsername.startsWith('@')
        ? sendTarget.receiverUsername
        : `@${sendTarget.receiverUsername}`,
      receiverUserId: sendTarget.receiverUserId,
      receiverTelegramId: sendTarget.receiverTelegramId,
      durationMinutes: sendDuration,
    }).catch(() => {
      /* inline error set in onFail */
    });
  }

  return (
    <div
      className={`cta-dock ${visible ? '' : 'cta-dock--off'}`}
      role="region"
      aria-label="Отправить запрет"
      aria-hidden={!visible}
    >
      <div className="cta-dock-inner">
        {sendInlineError ? (
          <p className="text-center text-[11px] text-red-400/95 mb-1.5 px-2 leading-snug">
            {sendInlineError.includes('Повторить') ? (
              <>
                Не отправилось.{' '}
                <button
                  type="button"
                  className="underline font-semibold text-red-300"
                  onClick={() => void zapretit()}
                >
                  Повторить?
                </button>
              </>
            ) : (
              sendInlineError
            )}
          </p>
        ) : null}
        <GlowCTA
          onClick={zapretit}
          ready={ctaReady}
          busy={sharing}
          helperText={helperText}
        >
          {label}
        </GlowCTA>
      </div>
    </div>
  );
}

export const SendBanDock = memo(SendBanDockInner);
