'use client';

/**
 * Live cutover host — sole mount for notification presentation.
 * React renders + emits intents; side effects (API) run in intent handlers.
 */

import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import type { FriendCard } from '@98plus/shared';
import { useApp } from '@/components/Providers';
import { api } from '@/lib/api';
import { deliverDirectChallenge } from '@/lib/deliver-challenge';
import { postOverboardWithTrace } from '@/lib/overboard-api';
import { readCreatedBanIdFromSendResponse } from '@/lib/send-ban-response-trace';
import {
  NotificationPresentationController,
  type NotificationOwnerCommand,
} from '@/notification-owner';
import {
  resultCardFromBanResult,
} from '@/notification-owner/notification-owner.ingest';
import {
  dispatchNotificationOwner,
  getNotificationOwnerState,
  subscribeNotificationOwner,
} from '@/notification-owner/notification-owner.store';

function friendLabel(f: FriendCard): string {
  if (f.username) return `@${f.username}`;
  if (f.firstName) return f.firstName;
  return f.id;
}

function friendOptionsFrom(friends: FriendCard[]) {
  return friends.slice(0, 40).map((f) => ({
    id: f.id,
    label: friendLabel(f),
  }));
}

export function NotificationOwnerHost() {
  const { token, friends, sessionReady, friendsReady } = useApp();
  const state = useSyncExternalStore(
    subscribeNotificationOwner,
    getNotificationOwnerState,
    getNotificationOwnerState,
  );
  const friendsRef = useRef(friends);
  friendsRef.current = friends;
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const bootDoneRef = useRef(false);

  useEffect(() => {
    if (bootDoneRef.current) return;
    if (!sessionReady) return;
    // Prefer friendsReady when available; do not block forever if empty.
    if (!friendsReady && friends.length === 0) {
      // Still allow boot once session is ready after a short wait is NOT allowed —
      // no timers. Boot when sessionReady; friends may arrive later via EDIT.
      // Wait only for sessionReady.
    }
    bootDoneRef.current = true;
    dispatchNotificationOwner({ type: 'BOOT_COMPLETE', next: null });
  }, [sessionReady, friendsReady, friends.length]);

  const onIntent = (command: NotificationOwnerCommand) => {
    if (command.type === 'OPEN_WHAT') {
      const opts = friendOptionsFrom(friendsRef.current);
      const selected =
        command.draft?.selectedUserId ??
        opts[0]?.id ??
        null;
      dispatchNotificationOwner({
        type: 'OPEN_WHAT',
        draft: {
          ...command.draft,
          selectedUserId: selected,
          friendOptions: opts,
        },
      });
      return;
    }

    if (command.type === 'SUBMIT_SEND') {
      dispatchNotificationOwner(command);
      const after = getNotificationOwnerState();
      if (after.presentation.kind !== 'SENDING') return;
      const snapshot = after.presentation.snapshot;
      const tok = tokenRef.current;
      const friend = friendsRef.current.find(
        (f) => f.id === snapshot.selectedUserId,
      );
      void (async () => {
        try {
          if (!tok) {
            dispatchNotificationOwner({ type: 'SEND_FAILED' });
            return;
          }
          const res = await deliverDirectChallenge({
            token: tok,
            text: snapshot.banText,
            receiverUsername: friend?.username ?? '',
            receiverUserId: snapshot.selectedUserId,
            receiverTelegramId: friend?.telegramId ?? null,
            durationMinutes: snapshot.durationMinutes,
            friends: friendsRef.current,
            directOnly: true,
          });
          const banId = readCreatedBanIdFromSendResponse(res);
          if (!banId) {
            dispatchNotificationOwner({ type: 'SEND_FAILED' });
            return;
          }
          dispatchNotificationOwner({ type: 'SEND_SUCCEEDED' });
        } catch {
          dispatchNotificationOwner({ type: 'SEND_FAILED' });
        }
      })();
      return;
    }

    if (command.type === 'REQUEST_CARD_ACTION') {
      dispatchNotificationOwner(command);
      const after = getNotificationOwnerState();
      if (after.presentation.kind !== 'ACTION_PENDING') return;
      const { displayId, banId, action } = after.presentation;
      const tok = tokenRef.current;
      void (async () => {
        try {
          if (!tok) {
            dispatchNotificationOwner({
              type: 'ACTION_FAILED',
              displayId,
              banId,
            });
            return;
          }
          if (action === 'overboard') {
            const res = await postOverboardWithTrace(banId, tok);
            if (res.ok === false || res.error) {
              dispatchNotificationOwner({
                type: 'ACTION_FAILED',
                displayId,
                banId,
              });
              return;
            }
            dispatchNotificationOwner({
              type: 'ACTION_CONFIRMED',
              displayId,
              banId,
              result: res.result
                ? resultCardFromBanResult(res.result)
                : undefined,
              consumeOnly: !res.result,
            });
            return;
          }
          if (action === 'check-answer') {
            const res = await api<{
              ok?: boolean;
              result?: Parameters<typeof resultCardFromBanResult>[0] | null;
            }>(`/bans/${banId}/check`, {
              method: 'POST',
              token: tok,
              body: JSON.stringify({ completed: true }),
            });
            dispatchNotificationOwner({
              type: 'ACTION_CONFIRMED',
              displayId,
              banId,
              result: res.result
                ? resultCardFromBanResult(res.result)
                : undefined,
              consumeOnly: !res.result,
            });
            return;
          }
          // counter → consume then open compose when Lobby is free
          dispatchNotificationOwner({
            type: 'ACTION_CONFIRMED',
            displayId,
            banId,
            consumeOnly: true,
          });
          if (getNotificationOwnerState().presentation.kind === 'LOBBY') {
            const opts = friendOptionsFrom(friendsRef.current);
            dispatchNotificationOwner({
              type: 'OPEN_WHAT',
              draft: {
                replyToBanId: banId,
                friendOptions: opts,
                selectedUserId: opts[0]?.id ?? null,
                banText: '',
              },
            });
          }
        } catch {
          dispatchNotificationOwner({
            type: 'ACTION_FAILED',
            displayId,
            banId,
          });
        }
      })();
      return;
    }

    dispatchNotificationOwner(command);
  };

  return (
    <div data-notification-owner-host="" data-np-cutover="live">
      <NotificationPresentationController
        state={state}
        onIntent={onIntent}
      />
    </div>
  );
}
