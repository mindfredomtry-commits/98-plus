'use client';

import { BigButton } from './BigButton';
import { ModalShell } from './ModalShell';

interface Props {
  open: boolean;
  onDone: () => void;
  onAgain: () => void;
}

export function BanSentSuccessOverlay({ open, onDone, onAgain }: Props) {
  return (
    <ModalShell open={open} onClose={onDone} ariaLabel="Запрет отправлен">
      <div className="modal-card-body text-center space-y-4">
        <p className="text-5xl">✔</p>
        <h2 className="text-3xl font-black text-glow">Запрет отправлен</h2>
        <p className="text-muted text-sm leading-relaxed">
          Как только получатель откроет 98+, запрет активируется автоматически.
        </p>
      </div>
      <div className="modal-card-actions space-y-3">
        <BigButton onClick={onDone}>Готово</BigButton>
        <BigButton variant="ghost" onClick={onAgain}>
          Запретить ещё
        </BigButton>
      </div>
    </ModalShell>
  );
}
