/**
 * Product Flow React surface — Product-owned screens only.
 * Global ownership is decided solely by the App Coordinator.
 */
'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  COMPOSE_RECIPIENT_MODES,
  coerceFriendList,
  type FriendCard,
  type UserPublic,
} from '@98plus/shared';
import { api } from '@/lib/api';
import { deliverDirectChallenge } from '@/lib/deliver-challenge';
import { WhoOverlay } from '@/components/instant-ban/WhoScreen';
import { SuccessScreen } from '@/components/instant-ban/SuccessScreen';
import type { ProductFlowController } from './product-flow.controller';

export type ProductFlowSurfaceProps = {
  controller: ProductFlowController;
  token: string | null;
  user: UserPublic | null;
  influencePercent: number;
  onboard: () => Promise<void>;
  refreshUser: () => Promise<void>;
  /** Ordinary Lobby compose must go through the Coordinator. */
  onComposeRequested?: () => void;
};

function useProductFlowState(controller: ProductFlowController) {
  return useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState,
  );
}

export function ProductFlowSurface({
  controller,
  token,
  user,
  influencePercent,
  onboard,
  refreshUser,
  onComposeRequested,
}: ProductFlowSurfaceProps) {
  const state = useProductFlowState(controller);
  const [friends, setFriends] = useState<FriendCard[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [composeText, setComposeText] = useState(state.banText);
  const [duration, setDuration] = useState(state.durationMinutes);

  useEffect(() => {
    setComposeText(state.banText);
    setDuration(state.durationMinutes);
  }, [state.banText, state.durationMinutes, state.navigationGeneration]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void api<{ friends?: unknown }>('/friends', { token })
      .then((res) => {
        if (cancelled) return;
        setFriends(coerceFriendList(res.friends));
      })
      .catch(() => {
        if (!cancelled) setFriends([]);
      });
    return () => {
      cancelled = true;
    };
  }, [token, state.route === 'WHO']);

  useEffect(() => {
    if (!state.reply || state.selectedUser) return;
    const target = friends.find((f) => f.id === state.reply?.targetUserId);
    if (target) {
      controller.setSelectedUser(target);
      return;
    }
    // Synthetic recipient when friends list has not loaded the sender yet.
    controller.setSelectedUser({
      id: state.reply.targetUserId,
      userId: state.reply.targetUserId,
      username: '',
      firstName: 'Opponent',
      photoUrl: null,
      avatarUrl: null,
      auraLabel: '',
      streak: 0,
      energyPercent: 0,
      presence: 'offline',
      lastSeenAt: null,
      interactionCount: 0,
      isRegistered: true,
    });
  }, [state.reply, state.selectedUser, friends, controller]);

  const onBeginSend = useCallback(() => {
    if (onComposeRequested) {
      onComposeRequested();
      return;
    }
    controller.navigateLocal('WHO');
  }, [controller, onComposeRequested]);

  const onSelectFriend = useCallback(
    (friend: FriendCard) => {
      controller.setSelectedUser(friend);
      controller.navigateLocal('WHAT');
    },
    [controller],
  );

  const onWhatContinue = useCallback(() => {
    const trimmed = composeText.trim();
    if (trimmed.length < 3) return;
    controller.setBanText(trimmed);
    controller.setDurationMinutes(duration);
    controller.navigateLocal('CONFIRM');
  }, [composeText, controller, duration]);

  const onConfirmSend = useCallback(async () => {
    if (!token || sending) return;
    const selected = controller.getState().selectedUser;
    const reply = controller.getState().reply;
    const text = composeText.trim();
    if (text.length < 3) return;
    setSending(true);
    setSendError(null);
    try {
      await onboard().catch(() => undefined);
      if (reply) {
        const res = await api<{ ban?: { id?: string }; id?: string }>(
          `/bans/${encodeURIComponent(reply.sourceItemId.replace(/^[^:]+:/, ''))}/reply`,
          {
            method: 'POST',
            token,
            body: JSON.stringify({
              text,
              durationMinutes: duration,
            }),
          },
        );
        const banId = res?.ban?.id ?? res?.id ?? reply.sourceItemId;
        controller.markSendSucceeded(String(banId));
      } else {
        if (!selected?.id) {
          setSendError('Выбери получателя');
          return;
        }
        const delivered = await deliverDirectChallenge({
          token,
          text,
          durationMinutes: duration,
          receiverUserId: selected.id,
          receiverUsername: selected.username ?? selected.firstName ?? '',
          friends,
          directOnly: true,
        });
        controller.markSendSucceeded(
          delivered.ban?.id ?? `sent:${Date.now()}`,
        );
      }
      void refreshUser().catch(() => undefined);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Не удалось отправить');
    } finally {
      setSending(false);
    }
  }, [
    composeText,
    controller,
    duration,
    friends,
    onboard,
    refreshUser,
    sending,
    token,
  ]);

  const onSuccessExit = useCallback(() => {
    if (controller.getState().reply) {
      controller.completeReply();
      return;
    }
    controller.releaseFlow('LOBBY');
  }, [controller]);

  const onBackFromWhat = useCallback(() => {
    if (controller.getState().reply) {
      controller.cancelReply();
      return;
    }
    controller.navigateLocal('WHO');
  }, [controller]);

  const onBackFromConfirm = useCallback(() => {
    controller.navigateLocal('WHAT');
  }, [controller]);

  const onDismissWho = useCallback(() => {
    controller.releaseFlow('LOBBY');
  }, [controller]);

  const recipientLabel = useMemo(() => {
    const selected = state.selectedUser;
    if (!selected) return '—';
    return selected.firstName || selected.username || '—';
  }, [state.selectedUser]);

  if (state.route === 'LOBBY') {
    return (
      <div
        className="product-flow-surface product-flow-surface--lobby"
        data-product-route="LOBBY"
      >
        <div className="pt-16 px-4 text-center">
          {user ? (
            <p className="text-muted text-sm mb-6">
              @{user.username ?? user.firstName}
            </p>
          ) : null}
          <p className="text-xs text-muted mb-4">
            Влияние {Math.round(influencePercent)}%
          </p>
          <button
            type="button"
            className="product-flow-lobby-cta"
            onClick={onBeginSend}
            data-testid="product-lobby-cta"
          >
            Запретить
          </button>
          <button
            type="button"
            className="product-flow-lobby-bans mt-4 block mx-auto text-sm text-muted"
            onClick={() => controller.navigateLocal('BANS')}
          >
            Твои запреты
          </button>
        </div>
      </div>
    );
  }

  if (state.route === 'BANS') {
    return (
      <div
        className="product-flow-surface product-flow-surface--bans"
        data-product-route="BANS"
      >
        <div className="pt-12 px-4">
          <button
            type="button"
            className="text-sm text-muted mb-4"
            onClick={() => controller.releaseFlow('LOBBY')}
          >
            ← Лобби
          </button>
          <h2 className="text-lg mb-2">Твои запреты</h2>
          <p className="text-sm text-muted">
            Секция bans остаётся Product-owned. Runtime очередь сюда не
            подмешивается.
          </p>
        </div>
      </div>
    );
  }

  if (state.route === 'WHO') {
    return (
      <div
        className="product-flow-surface product-flow-surface--who"
        data-product-route="WHO"
      >
        <WhoOverlay
          title="Кому запретить?"
          friends={friends}
          onSelect={onSelectFriend}
          onInviteMore={() => undefined}
          onDismissDragProgress={() => undefined}
          onDismissExitStart={() => undefined}
          onDismissToLobby={onDismissWho}
        />
      </div>
    );
  }

  if (state.route === 'WHAT') {
    return (
      <div
        className="product-flow-surface product-flow-surface--what px-4 pt-12"
        data-product-route="WHAT"
        data-reply={state.reply ? '1' : '0'}
      >
        <button
          type="button"
          className="text-sm text-muted mb-4"
          onClick={onBackFromWhat}
        >
          ← Назад
        </button>
        <p className="text-sm mb-2">
          {state.reply ? 'Ответ' : 'Запрет'} → {recipientLabel}
        </p>
        <textarea
          className="w-full min-h-[120px] rounded-xl bg-black/40 p-3 text-sm"
          value={composeText}
          onChange={(e) => setComposeText(e.target.value)}
          placeholder="Запрещаю…"
          data-testid="product-what-input"
        />
        <label className="block text-xs text-muted mt-3 mb-1">
          Длительность (мин)
        </label>
        <input
          type="number"
          min={1}
          max={1440}
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value) || 3)}
          className="w-24 rounded bg-black/40 p-2 text-sm"
        />
        <button
          type="button"
          className="mt-4 block product-flow-continue"
          disabled={composeText.trim().length < 3}
          onClick={onWhatContinue}
          data-testid="product-what-continue"
        >
          Далее
        </button>
      </div>
    );
  }

  if (state.route === 'CONFIRM') {
    return (
      <div
        className="product-flow-surface product-flow-surface--confirm px-4 pt-12"
        data-product-route="CONFIRM"
      >
        <button
          type="button"
          className="text-sm text-muted mb-4"
          onClick={onBackFromConfirm}
        >
          ← Назад
        </button>
        <p className="text-sm text-muted mb-1">Ты запрещаешь</p>
        <p className="text-lg mb-2">{recipientLabel}</p>
        <p className="text-sm mb-4">{composeText.trim()}</p>
        <p className="text-xs text-muted mb-4">{duration} мин</p>
        {sendError ? (
          <p className="text-sm text-red-400 mb-3">{sendError}</p>
        ) : null}
        <button
          type="button"
          className="product-flow-send"
          disabled={sending}
          onClick={() => {
            void onConfirmSend();
          }}
          data-testid="product-confirm-send"
        >
          {sending ? 'Отправка…' : 'Отправить'}
        </button>
      </div>
    );
  }

  if (state.route === 'SUCCESS') {
    return (
      <div
        className="product-flow-surface product-flow-surface--success"
        data-product-route="SUCCESS"
      >
        <SuccessScreen
          senderUser={user}
          recipientMode={COMPOSE_RECIPIENT_MODES.DIRECT}
          selectedUser={state.selectedUser}
          banText={composeText}
          durationMinutes={duration}
          onExitComplete={onSuccessExit}
          onShare={() => undefined}
        />
      </div>
    );
  }

  return null;
}
