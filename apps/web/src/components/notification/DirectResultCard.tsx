/**
 * Phase 0 — prop-driven Result card (no useApp / queue writes).
 */
'use client';

import type { BanResult, InteractionOutcome } from '@98plus/shared';
import { RESULT_COPY } from '@98plus/shared';
import { BigButton } from '@/components/BigButton';

export type DirectResultCardProps = {
  result: BanResult;
  disabled?: boolean;
  onGoToBans: () => void;
  onDismiss?: () => void;
  onReply?: () => void;
};

export function DirectResultCard({
  result,
  disabled = false,
  onGoToBans,
  onDismiss,
  onReply,
}: DirectResultCardProps) {
  const outcomeKey = String(
    (result as { outcome?: string; status?: string }).outcome ??
      (result as { status?: string }).status ??
      '',
  ).trim().toLowerCase() as InteractionOutcome;
  const headline =
    RESULT_COPY[outcomeKey]?.headline ?? 'Результат';

  return (
    <div className="direct-notification-card direct-result-card" data-kind="result">
      <div className="direct-notification-card__title">{headline}</div>
      {result.text ? (
        <p className="direct-notification-card__body">{result.text}</p>
      ) : null}
      <div className="direct-notification-card__actions">
        <BigButton
          disabled={disabled}
          onClick={() => {
            if (!disabled) onGoToBans();
          }}
        >
          К запретам
        </BigButton>
        {onReply ? (
          <BigButton
            disabled={disabled}
            variant="ghost"
            onClick={() => {
              if (!disabled) onReply();
            }}
          >
            Ответить
          </BigButton>
        ) : null}
        {onDismiss ? (
          <BigButton
            disabled={disabled}
            variant="ghost"
            onClick={() => {
              if (!disabled) onDismiss();
            }}
          >
            Закрыть
          </BigButton>
        ) : null}
      </div>
    </div>
  );
}
