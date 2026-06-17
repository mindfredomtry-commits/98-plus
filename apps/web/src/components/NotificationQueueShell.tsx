'use client';

import { Children, isValidElement, useEffect, type ReactNode } from 'react';
import { ModalShell } from './ModalShell';
import { overlayInputCaptureGuard } from '@/lib/overlay-input-guard';
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
  /** Incoming card display ban id — debug + incoming guard. */
  displayBanId?: string | null;
  incomingCardReady?: boolean;
  /** Waiting for next chain card after «К запретам». */
  advanceWaiting?: boolean;
};

function hasRenderableChildren(children: ReactNode): boolean {
  return Children.toArray(children).some(
    (child) => child != null && child !== false && isValidElement(child),
  );
}

/** Single persistent modal shell for queued notification handoff. */
export function NotificationQueueShell({
  kind,
  sessionActive,
  contentKey,
  children,
  displayBanId = null,
  incomingCardReady = false,
  advanceWaiting = false,
}: Props) {
  const hasContent = hasRenderableChildren(children);

  useEffect(() => {
    console.log('[notification-shell-debug] mounted', {
      kind,
      displayBanId,
      incomingCardReady,
      hasContent,
      sessionActive,
      contentKey,
    });
  }, [kind, displayBanId, incomingCardReady, hasContent, sessionActive, contentKey]);

  useEffect(() => {
    if (!kind) return;
    console.log('[notification-shell-debug] kind=', kind, {
      displayBanId,
      incomingCardReady,
      hasContent,
    });
  }, [kind, displayBanId, incomingCardReady, hasContent]);

  useEffect(() => {
    console.log('[notification-shell-debug] displayBan=', displayBanId ?? 'null');
  }, [displayBanId]);

  useEffect(() => {
    console.log(
      '[notification-shell-debug] incomingCardReady=',
      incomingCardReady,
    );
  }, [incomingCardReady]);

  useEffect(() => {
    if (!kind) return;
    if (kind === 'incoming' && !incomingCardReady) {
      console.log('[notification-shell-debug] rendering shell', {
        kind,
        displayBanId,
        reason: 'incoming-not-ready',
      });
      return;
    }
    if (!hasContent) {
      console.log('[notification-shell-debug] rendering shell', {
        kind,
        displayBanId,
        reason: 'no-content',
      });
      return;
    }
    console.log('[notification-shell-debug] rendering real card', {
      kind,
      displayBanId,
    });
  }, [kind, incomingCardReady, hasContent, displayBanId]);

  if (!kind) return null;

  if (kind === 'incoming' && !incomingCardReady && !advanceWaiting) {
    return null;
  }

  if (!hasContent && !advanceWaiting) {
    return null;
  }

  const handoff = sessionActive;
  const shellKind = kind ?? 'incoming';

  if (advanceWaiting && !hasContent) {
    return (
      <ModalShell
        open
        light
        stable
        handoff={handoff}
        sessionHosted={sessionActive}
        zIndex={APP_NOTIFICATION_Z_INDEX}
        closeOnBackdrop={false}
        ariaLabel={ARIA[shellKind]}
        onClose={() => {}}
        cardClassName={CARD_CLASS[shellKind]}
      >
        <div className="notification-queue-shell__advance-wait">
          Следующий запрет…
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell
      open
      light
      stable
      handoff={handoff}
      sessionHosted={sessionActive}
      zIndex={APP_NOTIFICATION_Z_INDEX}
      closeOnBackdrop={false}
      ariaLabel={ARIA[shellKind]}
      onClose={() => {}}
      cardClassName={CARD_CLASS[shellKind]}
    >
      <div
        key={handoff ? undefined : (contentKey ?? kind)}
        className="notification-queue-shell__content"
        onPointerDownCapture={overlayInputCaptureGuard}
        onClickCapture={overlayInputCaptureGuard}
      >
        {children}
      </div>
    </ModalShell>
  );
}
