/**
 * Product Flow React surface — presentation adapter over CreateBan domain.
 * Global ownership is decided solely by the App Coordinator.
 */
'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import {
  COMPOSE_RECIPIENT_MODES,
  type FriendCard,
  type UserPublic,
} from '@98plus/shared';
import { WhoOverlay } from '@/components/instant-ban/WhoScreen';
import { SuccessScreen } from '@/components/instant-ban/SuccessScreen';
import type { ProductFlowController } from './product-flow.controller';
import { selectCreateBanRecipientLabel } from './create-ban/create-ban.selectors';
import type { CreateBanErrorCode } from './create-ban/create-ban.types';
import '@/components/instant-ban/instant-ban.css';

export type ProductFlowSurfaceProps = {
  controller: ProductFlowController;
  user: UserPublic | null;
  influencePercent: number;
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

function createBanErrorLabel(code: CreateBanErrorCode): string {
  switch (code) {
    case 'RECIPIENT_REQUIRED':
      return 'Выбери получателя';
    case 'TEXT_REQUIRED':
    case 'TEXT_TOO_SHORT':
      return 'Напиши текст запрета';
    case 'INVALID_DURATION':
      return 'Некорректная длительность';
    case 'SUBMISSION_IN_PROGRESS':
      return 'Отправка…';
    case 'AUTH_REQUIRED':
      return 'Нет авторизации';
    case 'SUBMIT_FAILED':
      return 'Не удалось отправить';
    case 'RECIPIENTS_LOAD_FAILED':
      return 'Не удалось загрузить друзей';
    default:
      return 'Ошибка';
  }
}

export function ProductFlowSurface({
  controller,
  user,
  influencePercent,
  onComposeRequested,
}: ProductFlowSurfaceProps) {
  const state = useProductFlowState(controller);
  const createBan = controller.getCreateBanState();

  const friends = useMemo<FriendCard[]>(() => {
    return state.recipients.status === 'READY'
      ? state.recipients.recipients
      : [];
  }, [state.recipients]);

  const recipientLabel = selectCreateBanRecipientLabel(createBan);
  const sending = state.submission.status === 'SUBMITTING';
  const sendError =
    state.submission.status === 'FAILED'
      ? state.submission.error.detail ??
        createBanErrorLabel(state.submission.error.code)
      : null;

  const onBeginSend = useCallback(() => {
    if (onComposeRequested) {
      onComposeRequested();
      return;
    }
    // Fallback only when Coordinator wiring is absent.
    controller.navigateLocal('WHO');
  }, [controller, onComposeRequested]);

  const onSelectFriend = useCallback(
    (friend: FriendCard) => {
      controller.dispatch({ type: 'RECIPIENT_SELECTED', recipient: friend });
    },
    [controller],
  );

  const onWhatContinue = useCallback(() => {
    controller.dispatch({ type: 'CONTINUE_REQUESTED' });
  }, [controller]);

  const onConfirmSend = useCallback(() => {
    controller.dispatch({ type: 'SUBMIT_REQUESTED' });
  }, [controller]);

  const onSuccessExit = useCallback(() => {
    controller.dispatch({ type: 'SUCCESS_DISMISSED' });
  }, [controller]);

  const onBackFromWhat = useCallback(() => {
    controller.dispatch({ type: 'BACK_REQUESTED' });
  }, [controller]);

  const onBackFromConfirm = useCallback(() => {
    controller.dispatch({ type: 'BACK_REQUESTED' });
  }, [controller]);

  const onDismissWho = useCallback(() => {
    controller.dispatch({ type: 'RELEASE_TO_LOBBY_REQUESTED' });
  }, [controller]);

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
            onClick={() =>
              controller.dispatch({ type: 'NAVIGATE_BANS_REQUESTED' })
            }
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
            onClick={() =>
              controller.dispatch({ type: 'RELEASE_TO_LOBBY_REQUESTED' })
            }
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
          value={state.banText}
          onChange={(e) =>
            controller.dispatch({
              type: 'TEXT_CHANGED',
              text: e.target.value,
            })
          }
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
          value={state.durationMinutes}
          onChange={(e) =>
            controller.dispatch({
              type: 'DURATION_CHANGED',
              durationMinutes: Number(e.target.value) || 3,
            })
          }
          className="w-24 rounded bg-black/40 p-2 text-sm"
        />
        <button
          type="button"
          className="mt-4 block product-flow-continue"
          disabled={!state.validation.canContinueToConfirm}
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
        <p className="text-sm mb-4">{state.banText.trim()}</p>
        <p className="text-xs text-muted mb-4">{state.durationMinutes} мин</p>
        {sendError ? (
          <p className="text-sm text-red-400 mb-3">{sendError}</p>
        ) : null}
        <button
          type="button"
          className="product-flow-send"
          disabled={sending || !state.validation.canSubmit}
          onClick={onConfirmSend}
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
          banText={state.banText}
          durationMinutes={state.durationMinutes}
          onExitComplete={onSuccessExit}
          onShare={() => undefined}
        />
      </div>
    );
  }

  return null;
}
