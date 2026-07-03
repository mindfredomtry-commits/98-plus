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
import { instantBanDebug } from '@/lib/instant-ban-debug';
import { timingLog } from '@/lib/timing-log';
import { isDailyBanLimitApiError, isInsufficientEnergyApiError } from '@/lib/energy-gate';
import { SHARE_PICKER_USERNAME } from '@98plus/shared';
import { ApiError } from '@/lib/api';
import { RequestTimeoutError } from '@/lib/request-timeout';
import {
  logSendBanResponseTrace,
  readCreatedBanIdFromSendResponse,
  snapshotSendBanResponseJson,
} from '@/lib/send-ban-response-trace';

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
  /** Called only after API confirms ban.id (never optimistically). */
  onSuccess: (banId: string) => void;
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
  /** Refresh after success modal closes — avoids flicker under modal. */
  scheduleDeferredSync?: () => void;
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
  const scheduleDeferredSyncRef = useRef(opts.scheduleDeferredSync);
  scheduleDeferredSyncRef.current = opts.scheduleDeferredSync;

  const send = useCallback(
    async (params: SendChallengeParams): Promise<'started' | 'skipped'> => {
      const token = tokenRef.current;
      if (!token) {
        throw new Error('Нет авторизации — перезапусти Mini App из Telegram');
      }
      if (inFlightRef.current) {
        instantBanDebug('send-skipped-hook', { reason: 'inFlight' });
        return 'skipped';
      }

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

      const hasReceiverTarget = Boolean(
        username || resolved.receiverUserId || resolved.receiverTelegramId,
      );
      const instantDirectSend =
        hasReceiverTarget &&
        !isSharePicker &&
        (resolved.isRegistered ||
          Boolean(resolved.receiverUserId || resolved.receiverTelegramId));

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
          directOnly: instantDirectSend,
        });

        const hasConfirmedBan = Boolean(res.ban?.id);
        const needsShare =
          res.requiresShare === true || res.pending === true;

        logSendBanResponseTrace({
          source: 'useSendChallenge:after-deliver',
          banText: params.text,
          targetUserId:
            resolved.receiverUserId ??
            resolved.receiverTelegramId?.toString() ??
            null,
          durationMinutes: params.durationMinutes,
          httpStatus: 200,
          ok: true,
          responseJson: snapshotSendBanResponseJson(res),
          createdBanId: res.ban?.id ?? readCreatedBanIdFromSendResponse(res),
          failureReason: null,
        });

        ctaLog('mutation:response', { needsShare, hasBan: hasConfirmedBan });

        if (needsShare) {
          if (!res.shareUrl) {
            throw new Error('Не удалось отправить вызов');
          }

          onRequiresShareRef.current?.();

          setSharing(true);
          ctaLog('share:open');

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

          if (hasConfirmedBan && res.ban?.id) {
            onOptimisticApplyRef.current({ ...params, username });
            onConfirmRef.current?.({ ...params, username });
            try {
              onSuccessRef.current(res.ban.id);
            } catch (handoffErr) {
              logSendBanResponseTrace({
                source: 'useSendChallenge:onSuccess-threw-share-path',
                banText: params.text,
                targetUserId:
                  resolved.receiverUserId ??
                  resolved.receiverTelegramId?.toString() ??
                  null,
                durationMinutes: params.durationMinutes,
                httpStatus: 200,
                ok: true,
                responseJson: snapshotSendBanResponseJson(res),
                createdBanId: res.ban.id,
                thrownAfterCreate: true,
                successCardWillOpen: false,
                errorName:
                  handoffErr instanceof Error
                    ? handoffErr.name
                    : typeof handoffErr,
                errorMessage:
                  handoffErr instanceof Error
                    ? handoffErr.message
                    : String(handoffErr),
                failureReason: 'onSuccess-callback-threw-after-create-share-path',
              });
              throw handoffErr;
            }
          }
          scheduleDeferredSyncRef.current?.();
        } else {
          if (!hasConfirmedBan) {
            logSendBanResponseTrace({
              source: 'useSendChallenge:missing-ban-id',
              banText: params.text,
              targetUserId:
                resolved.receiverUserId ??
                resolved.receiverTelegramId?.toString() ??
                null,
              durationMinutes: params.durationMinutes,
              httpStatus: 200,
              ok: true,
              responseJson: snapshotSendBanResponseJson(res),
              createdBanId: null,
              thrownAfterCreate: false,
              successCardWillOpen: false,
              failureReason: 'response-ok-but-ban-id-missing',
            });
            throw new Error('Сервер не подтвердил запрет');
          }
          timingLog('sendBan confirmed', performance.now() - requestStarted);
          console.log('[send-response]', {
            banId: res.ban!.id,
            elapsedMs: Math.round(performance.now() - requestStarted),
            endpoint: '/bans/send',
          });
          window.__debug98log?.('[send-response]', {
            banId: res.ban!.id,
            elapsedMs: Math.round(performance.now() - requestStarted),
            endpoint: '/bans/send',
          });
          onOptimisticApplyRef.current({ ...params, username });
          onConfirmRef.current?.({ ...params, username });
          logSendBanResponseTrace({
            source: 'useSendChallenge:before-onSuccess',
            banText: params.text,
            targetUserId:
              resolved.receiverUserId ??
              resolved.receiverTelegramId?.toString() ??
              null,
            durationMinutes: params.durationMinutes,
            httpStatus: 200,
            ok: true,
            responseJson: snapshotSendBanResponseJson(res),
            createdBanId: res.ban!.id,
            successCardWillOpen: true,
            failureReason: null,
          });
          try {
            onSuccessRef.current(res.ban!.id);
          } catch (handoffErr) {
            logSendBanResponseTrace({
              source: 'useSendChallenge:onSuccess-threw',
              banText: params.text,
              targetUserId:
                resolved.receiverUserId ??
                resolved.receiverTelegramId?.toString() ??
                null,
              durationMinutes: params.durationMinutes,
              httpStatus: 200,
              ok: true,
              responseJson: snapshotSendBanResponseJson(res),
              createdBanId: res.ban!.id,
              thrownAfterCreate: true,
              successCardWillOpen: false,
              errorName:
                handoffErr instanceof Error ? handoffErr.name : typeof handoffErr,
              errorMessage:
                handoffErr instanceof Error
                  ? handoffErr.message
                  : String(handoffErr),
              failureReason: 'onSuccess-callback-threw-after-create',
            });
            throw handoffErr;
          }
          scheduleDeferredSyncRef.current?.();
        }

        logSendBanResponseTrace({
          source: 'useSendChallenge:mutation-complete',
          banText: params.text,
          targetUserId:
            resolved.receiverUserId ??
            resolved.receiverTelegramId?.toString() ??
            null,
          durationMinutes: params.durationMinutes,
          httpStatus: 200,
          ok: true,
          responseJson: snapshotSendBanResponseJson(res),
          createdBanId: res.ban?.id ?? null,
          successCardWillOpen: hasConfirmedBan && !needsShare,
          failureReason: null,
        });

        ctaLog('mutation:success');
        return 'started';
      } catch (e) {
        if (isInsufficientEnergyApiError(e) || isDailyBanLimitApiError(e)) {
          throw e;
        }
        const message = formatDeliveryError(e);
        logSendBanResponseTrace({
          source: 'useSendChallenge:catch',
          banText: params.text,
          targetUserId:
            params.receiverUserId ??
            params.receiverTelegramId?.toString() ??
            null,
          durationMinutes: params.durationMinutes,
          httpStatus: e instanceof ApiError ? e.status : e instanceof RequestTimeoutError ? 408 : null,
          ok: false,
          errorName: e instanceof Error ? e.name : typeof e,
          errorMessage: message,
          successCardWillOpen: false,
          failureReason:
            e instanceof RequestTimeoutError
              ? 'hook-catch-request-timeout'
              : e instanceof ApiError
                ? `hook-catch-api:${e.status}`
                : 'hook-catch-post-response',
        });
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
    [],
  );

  return {
    send,
    sharing,
    inFlight,
    busy: sharing || inFlight,
  };
}
