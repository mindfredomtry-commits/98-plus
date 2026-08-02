/**
 * Product Flow React surface — presentation adapter over CreateBan read model.
 * Emits CreateBanUiIntent only; never dispatches Runtime or navigates locally.
 */
'use client';

import { useCallback, useSyncExternalStore } from 'react';
import type { FriendCard, UserPublic } from '@98plus/shared';
import type { ProductFlowController } from './product-flow.controller';
import {
  selectCreateBanRecipientLabel,
  selectCreateBanSuccessPresentation,
  selectCreateBanWhoPresentation,
} from './create-ban/create-ban.selectors';
import type {
  CreateBanErrorCode,
  CreateBanUiIntent,
} from './create-ban/create-ban.types';
import { ProductWhoScreen } from './presentation/WhoScreen';
import { ProductSuccessScreen } from './presentation/SuccessScreen';

export type ProductFlowSurfaceProps = {
  /** Read model only — Presentation must not call dispatch/navigate on it. */
  controller: ProductFlowController;
  user: UserPublic | null;
  influencePercent: number;
  /** Typed CreateBan intents — Coordinator routes to Domain Port. */
  onIntent: (intent: CreateBanUiIntent) => void;
  /** Application intent — open Settings owner (not a CreateBan intent). */
  onOpenSettings?: () => void;
  /** Application intent — open Notifications owner (not a CreateBan intent). */
  onOpenNotifications?: () => void;
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
  onIntent,
  onOpenSettings,
  onOpenNotifications,
}: ProductFlowSurfaceProps) {
  const state = useProductFlowState(controller);
  const createBan = controller.getCreateBanState();
  const who = selectCreateBanWhoPresentation(createBan);
  const success = selectCreateBanSuccessPresentation(createBan);

  const recipientLabel = selectCreateBanRecipientLabel(createBan);
  const sending = state.submission.status === 'SUBMITTING';
  const sendError =
    state.submission.status === 'FAILED'
      ? state.submission.error.detail ??
        createBanErrorLabel(state.submission.error.code)
      : null;

  const emit = useCallback(
    (intent: CreateBanUiIntent) => {
      onIntent(intent);
    },
    [onIntent],
  );

  const onBeginSend = useCallback(() => {
    emit({ type: 'COMPOSE_REQUESTED' });
  }, [emit]);

  const onConfirmRecipient = useCallback(
    (friend: FriendCard) => {
      emit({ type: 'RECIPIENT_SELECTED', recipient: friend });
    },
    [emit],
  );

  const onWhatContinue = useCallback(() => {
    emit({ type: 'CONTINUE_REQUESTED' });
  }, [emit]);

  const onConfirmSend = useCallback(() => {
    emit({ type: 'SUBMIT_REQUESTED' });
  }, [emit]);

  const onSuccessExit = useCallback(() => {
    emit({ type: 'SUCCESS_DISMISSED' });
  }, [emit]);

  const onBackFromWhat = useCallback(() => {
    emit({ type: 'BACK_REQUESTED' });
  }, [emit]);

  const onBackFromConfirm = useCallback(() => {
    emit({ type: 'BACK_REQUESTED' });
  }, [emit]);

  const onWhoBack = useCallback(() => {
    emit({ type: 'RELEASE_TO_LOBBY_REQUESTED' });
  }, [emit]);

  const onWhoRetry = useCallback(() => {
    emit({ type: 'RECIPIENTS_RETRY_REQUESTED' });
  }, [emit]);

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
            onClick={() => emit({ type: 'NAVIGATE_BANS_REQUESTED' })}
          >
            Твои запреты
          </button>
          {onOpenSettings ? (
            <button
              type="button"
              className="product-flow-lobby-settings mt-4 block mx-auto text-sm text-muted"
              onClick={onOpenSettings}
              data-testid="product-lobby-settings"
            >
              Настройки
            </button>
          ) : null}
          {onOpenNotifications ? (
            <button
              type="button"
              className="product-flow-lobby-notifications mt-4 block mx-auto text-sm text-muted"
              onClick={onOpenNotifications}
              data-testid="product-lobby-notifications"
            >
              Уведомления
            </button>
          ) : null}
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
            onClick={() => emit({ type: 'RELEASE_TO_LOBBY_REQUESTED' })}
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
        <ProductWhoScreen
          recipientsStatus={who.recipientsStatus}
          recipients={who.recipients}
          selectedRecipientId={who.selectedRecipientId}
          isReply={who.isReply}
          replyRecipientLabel={who.replyRecipientLabel}
          errorDetail={who.errorDetail}
          onSelectRecipient={() => undefined}
          onConfirmRecipient={onConfirmRecipient}
          onBack={onWhoBack}
          onRetry={onWhoRetry}
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
            emit({
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
            emit({
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
        <ProductSuccessScreen
          recipientLabel={success.recipientLabel}
          banText={success.banText}
          durationMinutes={success.durationMinutes}
          isReply={success.isReply}
          onComplete={onSuccessExit}
        />
      </div>
    );
  }

  return null;
}
