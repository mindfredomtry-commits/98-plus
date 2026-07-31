/**
 * Product SUCCESS presentation — summary + primary completion only.
 * Receives prepared state; emits callbacks. No domain/API imports.
 */
'use client';

import React from 'react';

export type ProductSuccessScreenProps = {
  recipientLabel: string;
  banText: string;
  durationMinutes: number;
  isReply: boolean;
  onComplete: () => void;
  /** Optional secondary action; omitted when not provided. */
  onCreateAnother?: () => void;
};

export function emitSuccessComplete(onComplete: () => void): void {
  onComplete();
}

export function emitSuccessCreateAnother(
  onCreateAnother: (() => void) | undefined,
): boolean {
  if (!onCreateAnother) return false;
  onCreateAnother();
  return true;
}

export function ProductSuccessScreen({
  recipientLabel,
  banText,
  durationMinutes,
  isReply,
  onComplete,
  onCreateAnother,
}: ProductSuccessScreenProps) {
  return (
    <div
      className="product-success-screen px-4 pt-16 pb-8 text-center"
      data-product-success
      data-reply={isReply ? '1' : '0'}
    >
      <h2 className="text-xl mb-4" data-testid="product-success-title">
        Отправлено
      </h2>
      <p className="text-sm text-muted mb-1" data-testid="product-success-mode">
        {isReply ? 'Ответ' : 'Запрет'}
      </p>
      <p className="text-lg mb-2" data-testid="product-success-recipient">
        {recipientLabel}
      </p>
      <p className="text-sm mb-2" data-testid="product-success-text">
        {banText}
      </p>
      <p
        className="text-xs text-muted mb-6"
        data-testid="product-success-duration"
      >
        {durationMinutes} мин
      </p>
      <button
        type="button"
        className="product-flow-continue block mx-auto"
        onClick={() => emitSuccessComplete(onComplete)}
        data-testid="product-success-complete"
      >
        Готово
      </button>
      {onCreateAnother ? (
        <button
          type="button"
          className="mt-4 block mx-auto text-sm text-muted"
          onClick={() => emitSuccessCreateAnother(onCreateAnother)}
          data-testid="product-success-create-another"
        >
          Ещё запрет
        </button>
      ) : null}
    </div>
  );
}
