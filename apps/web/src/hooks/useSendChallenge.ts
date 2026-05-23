'use client';

import { useCallback, useRef, useState } from 'react';
import { ANALYTICS_EVENTS, type FriendCard } from '@98plus/shared';
import { safeResolveReceiverTarget } from '@/lib/resolve-receiver';
import { api } from '@/lib/api';
import {
  deliverDirectChallenge,
  formatDeliveryError,
} from '@/lib/deliver-challenge';
import { handleShareChallenge } from '@/lib/share';
import { ctaLog } from '@/lib/cta-log';

export function useSendChallenge(opts: {
  token: string | null;
  friends?: FriendCard[] | null;
  onSuccess: () => void;
  onboard: () => Promise<void>;
  refreshUser: () => Promise<void>;
  reloadPending: () => Promise<void>;
  reloadFriends: () => Promise<void>;
  onSendSuccess?: (username: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);

  const tokenRef = useRef(opts.token);
  tokenRef.current = opts.token;
  const friendsRef = useRef(opts.friends);
  friendsRef.current = opts.friends;
  const onSuccessRef = useRef(opts.onSuccess);
  onSuccessRef.current = opts.onSuccess;
  const onboardRef = useRef(opts.onboard);
  onboardRef.current = opts.onboard;
  const refreshUserRef = useRef(opts.refreshUser);
  refreshUserRef.current = opts.refreshUser;
  const reloadPendingRef = useRef(opts.reloadPending);
  reloadPendingRef.current = opts.reloadPending;
  const reloadFriendsRef = useRef(opts.reloadFriends);
  reloadFriendsRef.current = opts.reloadFriends;
  const onSendSuccessRef = useRef(opts.onSendSuccess);
  onSendSuccessRef.current = opts.onSendSuccess;

  const send = useCallback(
    async (params: {
      text: string;
      receiverUsername: string;
      receiverUserId?: string | null;
      receiverTelegramId?: string | null;
      durationMinutes: number;
    }) => {
      const token = tokenRef.current;
      if (!token) {
        throw new Error('Нет авторизации — перезапусти Mini App из Telegram');
      }

      setLoading(true);
      const username = params.receiverUsername.replace(/^@/, '').trim();

      try {
        const resolved = safeResolveReceiverTarget(
          username,
          friendsRef.current,
          {
            receiverUserId: params.receiverUserId,
            receiverTelegramId: params.receiverTelegramId,
          },
        );

        ctaLog('mutation:start', {
          username,
          path: resolved.isRegistered ? 'direct' : 'invite-share',
          userId: resolved.receiverUserId,
          telegramId: resolved.receiverTelegramId,
        });

        const res = await deliverDirectChallenge({
          token,
          text: params.text,
          durationMinutes: params.durationMinutes,
          receiverUsername: username,
          receiverUserId: resolved.receiverUserId,
          receiverTelegramId: resolved.receiverTelegramId,
          friends: friendsRef.current,
          directOnly: false,
        });

        const needsShare =
          res.requiresShare === true || res.pending === true;

        ctaLog('mutation:response', {
          needsShare,
          hasBan: !!res.ban,
          requiresShare: res.requiresShare,
        });

        if (needsShare) {
          if (!res.shareUrl) {
            throw new Error('Не удалось отправить вызов');
          }
          setSharing(true);
          ctaLog('share:open');
          await handleShareChallenge(
            params.text.trim(),
            params.durationMinutes,
            res.shareUrl,
          );
          ctaLog('share:done');

          await api('/friends/touch-share', {
            method: 'POST',
            token,
            body: JSON.stringify({
              targetUsername: username,
              recentChallenge: params.text.trim(),
            }),
          }).catch(() => {});

          await api('/analytics/track', {
            method: 'POST',
            token,
            body: JSON.stringify({ name: ANALYTICS_EVENTS.INVITE_SHARED }),
          }).catch(() => {});
        }

        await onboardRef.current().catch(() => {});
        await refreshUserRef.current();
        await reloadPendingRef.current();
        await reloadFriendsRef.current();
        onSendSuccessRef.current?.(username);
        onSuccessRef.current();
        ctaLog('mutation:success');
      } catch (e) {
        ctaLog('mutation:fail', {
          message: e instanceof Error ? e.message : String(e),
        });
        throw new Error(formatDeliveryError(e));
      } finally {
        setLoading(false);
        setSharing(false);
      }
    },
    [],
  );

  return { send, loading, sharing, busy: loading || sharing };
}
