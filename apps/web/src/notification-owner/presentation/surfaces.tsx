'use client';

import React from 'react';
import type { NotificationOwnerCommand } from '../notification-owner.types';
import type { ComposeDraft } from '../notification-owner.types';

export type PresentationIntentHandler = (
  command: NotificationOwnerCommand,
) => void;

export function BootSurface() {
  return (
    <div data-np-surface="BOOT" data-np-boot-complete="">
      <div className="np-boot">Загрузка 98+</div>
    </div>
  );
}

export function LobbySurface({ onIntent }: { onIntent: PresentationIntentHandler }) {
  return (
    <div data-np-surface="LOBBY" data-np-lobby-mode="full">
      <div data-np-lobby-chrome="" className="np-lobby-chrome">
        <div data-np-lobby-logo="" className="np-lobby-logo">
          98+
        </div>
        <div data-np-lobby-orb="" className="np-lobby-orb" aria-hidden />
        <button
          type="button"
          data-np-lobby-cta=""
          className="np-lobby-cta"
          onClick={() => onIntent({ type: 'OPEN_WHAT' })}
        >
          Запретить
        </button>
      </div>
    </div>
  );
}

export function WhatSurface({
  draft,
  onIntent,
}: {
  draft: ComposeDraft;
  onIntent: PresentationIntentHandler;
}) {
  const options = draft.friendOptions ?? [];
  return (
    <div data-np-surface="WHAT">
      <div data-np-what-compose="" className="np-what">
        <p>Кому и что запретить</p>
        <div data-np-what-friends="">
          {options.length === 0 ? (
            <p data-np-what-target="">{draft.selectedUserId ?? '—'}</p>
          ) : (
            options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                data-np-what-friend={opt.id}
                data-np-what-friend-selected={
                  draft.selectedUserId === opt.id ? '' : undefined
                }
                onClick={() =>
                  onIntent({
                    type: 'EDIT_DRAFT',
                    draft: { selectedUserId: opt.id },
                  })
                }
              >
                {opt.label}
              </button>
            ))
          )}
        </div>
        <textarea
          data-np-what-text=""
          value={draft.banText}
          aria-label="Текст запрета"
          onChange={(e) =>
            onIntent({
              type: 'EDIT_DRAFT',
              draft: { banText: e.target.value },
            })
          }
        />
        <button type="button" onClick={() => onIntent({ type: 'OPEN_CONFIRM' })}>
          Далее
        </button>
      </div>
    </div>
  );
}

export function ConfirmSurface({
  draft,
  onIntent,
}: {
  draft: ComposeDraft;
  onIntent: PresentationIntentHandler;
}) {
  return (
    <div data-np-surface="CONFIRM">
      <div data-np-confirm-card="" className="np-confirm">
        <p>Подтверди запрет</p>
        <p>{draft.selectedUserId}</p>
        <p>«{draft.banText}»</p>
        <button type="button" onClick={() => onIntent({ type: 'OPEN_WHAT' })}>
          Назад
        </button>
        <button type="button" onClick={() => onIntent({ type: 'SUBMIT_SEND' })}>
          Удерживай
        </button>
      </div>
    </div>
  );
}

export function SendingSurface({
  banText,
}: {
  banText: string;
}) {
  return (
    <div data-np-surface="SENDING">
      <div data-np-sending="" className="np-sending">
        <p>Отправляем…</p>
        <p>«{banText}»</p>
      </div>
    </div>
  );
}

export function SuccessSurface({
  snapshot,
  onIntent,
}: {
  snapshot: { banText: string; selectedUserId: string };
  onIntent: PresentationIntentHandler;
}) {
  return (
    <div data-np-surface="SUCCESS">
      <div data-np-success-card="" className="np-success">
        <p>Отправлено</p>
        <p>{snapshot.selectedUserId}</p>
        <p>«{snapshot.banText}»</p>
        <button type="button" onClick={() => onIntent({ type: 'CLOSE_SUCCESS' })}>
          Дальше
        </button>
      </div>
    </div>
  );
}

export function IncomingSurface({
  displayId,
  banId,
  card,
  onIntent,
  pending = false,
  actionLabel,
}: {
  displayId: string;
  banId: string;
  card: { text: string; senderLabel: string };
  onIntent: PresentationIntentHandler;
  pending?: boolean;
  actionLabel?: string;
}) {
  return (
    <div
      data-np-surface={pending ? 'ACTION_PENDING' : 'INCOMING'}
      data-np-display-id={displayId}
      data-np-ban-id={banId}
    >
      <div data-np-backdrop="" className="np-backdrop" aria-hidden />
      <div data-np-overlay-shell="" className="np-shell">
        <div data-np-card="" className="np-card">
          <p>{card.senderLabel}</p>
          <p>«{card.text}»</p>
          {pending ? (
            <div data-np-action-pending="" data-np-incoming-controls="">
              {actionLabel ?? 'Отправляем…'}
            </div>
          ) : (
            <div data-np-incoming-controls="" className="np-controls">
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  onIntent({ type: 'REQUEST_CARD_ACTION', action: 'counter' })
                }
              >
                Запретить в ответ
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  onIntent({ type: 'REQUEST_CARD_ACTION', action: 'overboard' })
                }
              >
                Перебор!
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => onIntent({ type: 'DISMISS_CARD' })}
              >
                Закрыть
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function CheckSurface({
  displayId,
  banId,
  card,
  onIntent,
  pending = false,
}: {
  displayId: string;
  banId: string;
  card: { text: string; senderLabel: string };
  onIntent: PresentationIntentHandler;
  pending?: boolean;
}) {
  return (
    <div
      data-np-surface={pending ? 'ACTION_PENDING' : 'CHECK'}
      data-np-display-id={displayId}
      data-np-ban-id={banId}
    >
      <div data-np-backdrop="" className="np-backdrop" aria-hidden />
      <div data-np-overlay-shell="" className="np-shell">
        <div data-np-card="" className="np-card">
          <p>{card.senderLabel}</p>
          <p>«{card.text}»</p>
          {pending ? (
            <div data-np-action-pending="" data-np-check-controls="">
              Отвечаем…
            </div>
          ) : (
            <div data-np-check-controls="" className="np-controls">
              <button
                type="button"
                onClick={() =>
                  onIntent({
                    type: 'REQUEST_CARD_ACTION',
                    action: 'check-answer',
                  })
                }
              >
                Ответить
              </button>
              <button type="button" onClick={() => onIntent({ type: 'DISMISS_CARD' })}>
                Закрыть
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ResultSurface({
  displayId,
  banId,
  card,
  onIntent,
}: {
  displayId: string;
  banId: string;
  card: { title: string; body: string };
  onIntent: PresentationIntentHandler;
}) {
  return (
    <div data-np-surface="RESULT" data-np-display-id={displayId} data-np-ban-id={banId}>
      <div data-np-backdrop="" className="np-backdrop" aria-hidden />
      <div data-np-overlay-shell="" className="np-shell">
        <div data-np-card="" data-np-result-card="" className="np-card">
          <p>{card.title}</p>
          <p>{card.body}</p>
          <button type="button" onClick={() => onIntent({ type: 'CLOSE_RESULT' })}>
            Далее
          </button>
        </div>
      </div>
    </div>
  );
}
