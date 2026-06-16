'use client';

import { memo } from 'react';
import { createPortal } from 'react-dom';
import { BigButton } from './BigButton';
import { ModalShell } from './ModalShell';
import { traceSuccessHide, traceSuccessPayoffCtaClick } from '@/lib/success-card-trace';

interface Props {
  open: boolean;
  onDone: () => void;
  onAgain: () => void;
}

function BanSentSuccessOverlayInner({ open, onDone, onAgain }: Props) {
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <ModalShell
      open
      light
      stable
      zIndex={80}
      closeOnBackdrop={false}
      onClose={onDone}
      ariaLabel="Запрет отправлен"
    >
      <div className="modal-card-body text-center space-y-4">
        <p className="text-5xl">✔</p>
        <h2 className="text-3xl font-black text-glow">Запрет отправлен</h2>
        <p className="text-muted text-sm leading-relaxed">
          Как только получатель откроет 98+, запрет активируется автоматически.
        </p>
      </div>
      <div className="modal-card-actions space-y-3">
        <BigButton
          onClick={() => {
            traceSuccessHide('BanSentSuccessOverlay-onDone');
            onDone();
          }}
        >
          Готово
        </BigButton>
        <BigButton
          variant="ghost"
          onClick={() => {
            traceSuccessPayoffCtaClick({ component: 'BanSentSuccessOverlay' });
            traceSuccessHide('BanSentSuccessOverlay-onAgain');
            onAgain();
          }}
        >
          Запретить ещё
        </BigButton>
      </div>
    </ModalShell>,
    document.body,
  );
}

export const BanSentSuccessOverlay = memo(BanSentSuccessOverlayInner);
