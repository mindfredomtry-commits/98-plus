'use client';

import type { ReactNode } from 'react';
import { ModalShell } from './ModalShell';
import { APP_NOTIFICATION_Z_INDEX } from '@/lib/overlay-queue';

type OverlayKind = 'incoming' | 'check' | 'result';

const ARIA: Record<OverlayKind, string> = {
  incoming: 'Входящий запрет',
  check: 'Проверка запрета',
  result: 'Результат проверки',
};

const CARD_CLASS: Record<OverlayKind, string> = {
  incoming: 'modal-card--incoming',
  check: 'modal-card--check',
  result: 'modal-card--result',
};

type Props = {
  kind: OverlayKind | null;
  sessionActive: boolean;
  contentKey: string | null;
  children: ReactNode;
};

/** Single persistent modal shell for queued notification handoff. */
export function NotificationQueueShell({
  kind,
  sessionActive,
  contentKey,
  children,
}: Props) {
  if (!sessionActive && !kind) return null;

  const handoff = sessionActive;
  const shellKind = kind ?? 'incoming';

  return (
    <ModalShell
      open
      light
      stable
      handoff={handoff}
      zIndex={APP_NOTIFICATION_Z_INDEX}
      closeOnBackdrop={false}
      ariaLabel={ARIA[shellKind]}
      onClose={() => {}}
      cardClassName={`${CARD_CLASS[shellKind]} modal-card--handoff`}
    >
      {kind ? (
        <div
          key={contentKey ?? kind}
          className="notification-queue-shell__content"
        >
          {children}
        </div>
      ) : null}
    </ModalShell>
  );
}
