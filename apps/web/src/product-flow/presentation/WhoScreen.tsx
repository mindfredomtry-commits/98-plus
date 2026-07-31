/**
 * Product WHO presentation — recipients list only.
 * Receives prepared state; emits callbacks. No domain/API imports.
 */
'use client';

import React, { useState } from 'react';
import type { FriendCard } from '@98plus/shared';

export type ProductWhoRecipientsStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'failed'
  | 'empty';

export type ProductWhoScreenProps = {
  title?: string;
  recipientsStatus: ProductWhoRecipientsStatus;
  recipients: FriendCard[];
  selectedRecipientId: string | null;
  isReply: boolean;
  replyRecipientLabel: string | null;
  errorDetail: string | null;
  onSelectRecipient: (recipient: FriendCard) => void;
  onConfirmRecipient: (recipient: FriendCard) => void;
  onBack: () => void;
  onRetry: () => void;
};

function recipientLabel(recipient: FriendCard): string {
  return recipient.firstName || recipient.username || recipient.id || '—';
}

/** Interaction helpers used by the screen (and tests without a DOM clicker). */
export function emitWhoSelect(
  recipient: FriendCard,
  onSelectRecipient: (recipient: FriendCard) => void,
): void {
  onSelectRecipient(recipient);
}

export function emitWhoConfirm(
  selected: FriendCard | null,
  onConfirmRecipient: (recipient: FriendCard) => void,
): boolean {
  if (!selected) return false;
  onConfirmRecipient(selected);
  return true;
}

export function ProductWhoScreen({
  title = 'Кому запретить?',
  recipientsStatus,
  recipients,
  selectedRecipientId,
  isReply,
  replyRecipientLabel,
  errorDetail,
  onSelectRecipient,
  onConfirmRecipient,
  onBack,
  onRetry,
}: ProductWhoScreenProps) {
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(
    selectedRecipientId,
  );
  const effectiveSelectedId = localSelectedId ?? selectedRecipientId;
  const selected =
    recipients.find((r) => r.id === effectiveSelectedId) ?? null;

  return (
    <div
      className="product-who-screen px-4 pt-12 pb-8"
      data-product-who
      data-recipients-status={recipientsStatus}
      data-reply={isReply ? '1' : '0'}
    >
      <button
        type="button"
        className="text-sm text-muted mb-4"
        onClick={onBack}
        data-testid="product-who-back"
      >
        ← Назад
      </button>

      <h2 className="text-lg mb-2" data-testid="product-who-title">
        {title}
      </h2>

      {isReply && replyRecipientLabel ? (
        <p
          className="text-sm text-muted mb-4"
          data-testid="product-who-reply-context"
        >
          Ответ → {replyRecipientLabel}
        </p>
      ) : null}

      {recipientsStatus === 'loading' || recipientsStatus === 'idle' ? (
        <p className="text-sm text-muted" data-testid="product-who-loading">
          Загрузка…
        </p>
      ) : null}

      {recipientsStatus === 'failed' ? (
        <div data-testid="product-who-error">
          <p className="text-sm text-red-400 mb-3">
            {errorDetail ?? 'Не удалось загрузить друзей'}
          </p>
          <button
            type="button"
            className="text-sm underline"
            onClick={onRetry}
            data-testid="product-who-retry"
          >
            Повторить
          </button>
        </div>
      ) : null}

      {recipientsStatus === 'empty' ? (
        <p className="text-sm text-muted" data-testid="product-who-empty">
          Нет доступных получателей
        </p>
      ) : null}

      {recipientsStatus === 'ready' ? (
        <ul className="flex flex-col gap-2 mb-6" data-testid="product-who-list">
          {recipients.map((recipient) => {
            const id = recipient.id ?? '';
            const selectedRow = id === effectiveSelectedId;
            return (
              <li key={id || recipient.username}>
                <button
                  type="button"
                  className={`w-full text-left rounded-xl px-3 py-3 text-sm ${
                    selectedRow ? 'bg-white/20' : 'bg-black/40'
                  }`}
                  data-testid="product-who-recipient"
                  data-recipient-id={id}
                  data-selected={selectedRow ? '1' : '0'}
                  onClick={() => {
                    setLocalSelectedId(id);
                    emitWhoSelect(recipient, onSelectRecipient);
                  }}
                >
                  <span className="block">{recipientLabel(recipient)}</span>
                  {recipient.username ? (
                    <span className="block text-xs text-muted">
                      @{recipient.username}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <button
        type="button"
        className="product-flow-continue block"
        disabled={!selected}
        onClick={() => {
          emitWhoConfirm(selected, onConfirmRecipient);
        }}
        data-testid="product-who-continue"
      >
        Далее
      </button>
    </div>
  );
}
