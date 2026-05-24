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
import { timingLog } from '@/lib/timing-log';
import { SHARE_PICKER_USERNAME } from '@98plus/shared';

export type SendChallengeParams = {
  text: string;
  receiverUsername: string;
  receiverUserId?: string | null;
  receiverTelegramId?: string | null;
  durationMinutes: number;
};

export function useSendChallenge(opts: {
  token: string | null;
  friends?: FriendCard[] | null;
  /** Direct send: called immediately on click (before API). */
  onSuccess: () => void;
  onOptimisticApply: (params: SendChallengeParams & { username: string }) => void;
  onConfirm?: (params: SendChallengeParams & { username: string }) => void;
  onFail: (
    params: SendChallengeParams & {
      username: string;
      message: string;
    },
  ) => void;
  /** Close instant success UI when API requires Telegram share instead. */
  onRequiresShare?: () => void;
  onboard: () => Promise<void>;
  refreshUser: () => Promise<void>;
  reloadPending: () => Promise<void>;
  reloadFriends: () => Promise<void>;
}) {
  const [sharing, setSharing] = useState(false);
  const [inFlight, setInFlight] = useState(false);
  const inFlightRef = useRef(false);

  const tokenRef = useRef(opts.token);
  tokenRef.current = opts.token;
  const friendsRef = useRef(opts.friends);
  friendsRef.current = opts.friends;
  const onSuccessRef = useRef(opts.onSuccess);
  onSuccessRef.current = opts.onSuccess;
  const onOptimisticApplyRef = useRef(opts.onOptimisticApply);
  onOptimisticApplyRef.current = opts.onOptimisticApply;
  const onConfirmRef = useRef(opts.onConfirm);
  onConfirmRef.current = opts.onConfirm;
  const onFailRef = useRef(opts.onFail);
  onFailRef.current = opts.onFail;
  const onRequiresShareRef = useRef(opts.onRequiresShare);
  onRequiresShareRef.current = opts.onRequiresShare;
  const onboardRef = useRef(opts.onboard);
  onboardRef.current = opts.onboard;
  const refreshUserRef = useRef(opts.refreshUser);
  refreshUserRef.current = opts.refreshUser;
  const reloadPendingRef = useRef(opts.reloadPending);
  reloadPendingRef.current = opts.reloadPending;
  const reloadFriendsRef = useRef(opts.reloadFriends);
  reloadFriendsRef.current = opts.reloadFriends;

  const backgroundSync = useCallback(() => {
    void onboardRef.current().catch(() => {});
    void refreshUserRef.current().catch(() => {});
    void reloadPendingRef.current().catch(() => {});
    void reloadFriendsRef.current().catch(() => {});
  }, []);

  const send = useCallback(
    async (params: SendChallengeParams) => {
      const token = tokenRef.current;
      if (!token) {
        throw new Error('Нет авторизации — перезапусти Mini App из Telegram');
      }
      if (inFlightRef.current) return;

      const username = params.receiverUsername.replace(/^@/, '').trim();
      const cleanUser = username.toLowerCase();
      const isSharePicker = cleanUser === SHARE_PICKER_USERNAME;

      const resolved = safeResolveReceiverTarget(
        username,
        friendsRef.current,
        {
          receiverUserId: params.receiverUserId,
          receiverTelegramId: params.receiverTelegramId,
        },
      );

      const instantDirectSend =
        Boolean(username) &&
        !isSharePicker &&
        (resolved.isRegistered ||
          Boolean(resolved.receiverUserId || resolved.receiverTelegramId));

      let showedInstantSuccess = false;

      if (instantDirectSend) {
        timingLog('sendBan optimistic applied immediately', 0);
        onOptimisticApplyRef.current({ ...params, username });
        onSuccessRef.current();
        showedInstantSuccess = true;
      }

      inFlightRef.current = true;
      setInFlight(true);
      const requestStarted = performance.now();

      try {
        ctaLog('mutation:start', {
          username,
          path: resolved.isRegistered ? 'direct' : 'invite-share',
          instant: instantDirectSend,
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

        ctaLog('mutation:response', { needsShare, hasBan: !!res.ban });

        if (needsShare) {
          if (!res.shareUrl) {
            throw new Error('Не удалось отправить вызов');
          }

          if (showedInstantSuccess) {
            onRequiresShareRef.current?.();
          }

          setSharing(true);
          ctaLog('share:open');

          if (!instantDirectSend) {
            onOptimisticApplyRef.current({ ...params, username });
          }

          await handleShareChallenge(
            params.text.trim(),
            params.durationMinutes,
            res.shareUrl,
          );
          ctaLog('share:done');
          setSharing(false);

          void api('/friends/touch-share', {
            method: 'POST',
            token,
            body: JSON.stringify({
              targetUsername: username,
              recentChallenge: params.text.trim(),
            }),
          }).catch(() => {});

          void api('/analytics/track', {
            method: 'POST',
            token,
            body: JSON.stringify({ name: ANALYTICS_EVENTS.INVITE_SHARED }),
          }).catch(() => {});

          if (!showedInstantSuccess) {
            onSuccessRef.current();
          }
        } else {
          timingLog('sendBan confirmed', performance.now() - requestStarted);
          onConfirmRef.current?.({ ...params, username });
          if (!showedInstantSuccess) {
            onSuccessRef.current();
          }
          backgroundSync();
        }

        ctaLog('mutation:success');
      } catch (e) {
        const message = formatDeliveryError(e);
        console.error('[98+] sendBan rollback', { username, message, error: e });
        ctaLog('mutation:fail', { message });
        onFailRef.current({ ...params, username, message });
        throw new Error(message);
      } finally {
        setSharing(false);
        inFlightRef.current = false;
        setInFlight(false);
      }
    },
    [backgroundSync],
  );

  return {
    send,
    sharing,
    inFlight,
    busy: sharing,
  };
}
