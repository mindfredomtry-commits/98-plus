'use client';

import { Children, isValidElement, useEffect, useLayoutEffect, type ReactNode } from 'react';
import { ModalShell } from './ModalShell';
import { APP_NOTIFICATION_CARD_Z_INDEX } from '@/lib/overlay-queue';
import { logCheckTransitionPlaceholderDecision, logCheckTransitionPlaceholderShown, logChainPlaceholderDecisionDiag, logChainPlaceholderStuckTrace, logNotificationQueueShellRenderTrace } from '@/lib/check-chain-drain-debug';

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
  /** Check card has ban payload — blocks empty boundary false-positive. */
  checkCardReady?: boolean;
  /** Waiting for next chain card after «К запретам». */
  advanceWaiting?: boolean;
  /** Overrides child-element probe — e.g. atomic queue result without wrapper false-positive. */
  shellContentReady?: boolean;
  /** Providers-side shell state for empty-frame diagnostics. */
  renderTrace?: Record<string, unknown>;
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
  checkCardReady = false,
  advanceWaiting = false,
  shellContentReady,
  renderTrace,
}: Props) {
  const hasRenderableChildrenProbe = hasRenderableChildren(children);
  const childProbeRenderable =
    kind === 'check'
      ? checkCardReady && hasRenderableChildrenProbe
      : hasRenderableChildrenProbe;
  const hasContent =
    shellContentReady !== undefined ? shellContentReady : childProbeRenderable;

  const resolveRenderBranch = (): string => {
    if (!kind) return 'return-null-no-kind';
    if (kind === 'incoming' && !incomingCardReady && !advanceWaiting) {
      return 'return-null-incoming-not-ready';
    }
    if (kind === 'check' && !checkCardReady && !advanceWaiting) {
      return 'return-null-check-not-ready';
    }
    if (!hasContent && !advanceWaiting) {
      return 'return-null-no-content-no-advance';
    }
    if (advanceWaiting && !hasContent) {
      return 'placeholder-advance-wait';
    }
    return 'modal-shell-content-wrapper';
  };

  const renderBranch = resolveRenderBranch();

  useLayoutEffect(() => {
    logNotificationQueueShellRenderTrace({
      kind,
      displayKind: kind,
      shellContentReady: shellContentReady ?? null,
      hasRenderableChildren: hasRenderableChildrenProbe,
      hasContent,
      advanceWaiting,
      renderBranch,
      sessionActive,
      displayBanId,
      contentKey,
      incomingCardReady,
      checkCardReady,
      childProbeRenderable,
      ...renderTrace,
    });
  }, [
    advanceWaiting,
    checkCardReady,
    childProbeRenderable,
    contentKey,
    displayBanId,
    hasContent,
    hasRenderableChildrenProbe,
    incomingCardReady,
    kind,
    renderBranch,
    renderTrace,
    sessionActive,
    shellContentReady,
  ]);

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

  if (kind === 'check' && !checkCardReady && !advanceWaiting) {
    return null;
  }

  if (!hasContent && !advanceWaiting) {
    return null;
  }

  const handoff = sessionActive;
  const shellKind = kind ?? 'incoming';

  useLayoutEffect(() => {
    if (!advanceWaiting && hasContent) return;
    logCheckTransitionPlaceholderDecision({
      source: 'NotificationQueueShell-render',
      chainAdvanceWaiting: advanceWaiting,
      notificationChainTransitioning: sessionActive,
      shouldShowPlaceholder: advanceWaiting && !hasContent,
      reason:
        advanceWaiting && !hasContent
          ? 'advance-waiting-no-content'
          : advanceWaiting && hasContent
            ? 'advance-waiting-but-has-content'
            : 'no-advance-waiting',
      kind: shellKind,
      hasContent,
      displayBanId,
    });
    logChainPlaceholderDecisionDiag({
      source: 'NotificationQueueShell-render',
      phase:
        advanceWaiting && !hasContent
          ? 'placeholder-advance-wait'
          : renderBranch,
      shellKind,
      effectiveKind:
        (renderTrace?.effectiveNotificationQueueShellKind as string | null | undefined) ??
        kind,
      advanceWaiting,
      hasContent,
      hasRenderableChildren: hasRenderableChildrenProbe,
      queueLen: (renderTrace?.queueLen as number | null | undefined) ?? null,
      pendingLen: (renderTrace?.pendingLen as number | null | undefined) ?? null,
      overlayHeadKind:
        (renderTrace?.overlayQueueHeadKind as string | null | undefined) ?? null,
      overlayHeadBanId:
        (renderTrace?.overlayQueueHeadBanId as string | null | undefined) ?? null,
      pendingHeadKind:
        (renderTrace?.pendingStartupHeadKind as string | null | undefined) ?? null,
      pendingHeadBanId:
        (renderTrace?.pendingStartupHeadBanId as string | null | undefined) ?? null,
      blockReason:
        advanceWaiting && !hasContent
          ? 'advance-waiting-no-content'
          : advanceWaiting && hasContent && !hasRenderableChildrenProbe
            ? 'advance-waiting-hasContent-but-no-renderable-children'
            : null,
      renderBranch,
      checkCardReady,
      incomingCardReady,
      chainAdvancePlaceholderKind:
        renderTrace?.chainAdvancePlaceholderKind ?? null,
    });
    if (advanceWaiting && !hasContent) {
      logCheckTransitionPlaceholderShown({
        source: 'NotificationQueueShell-render',
        chainAdvanceWaiting: advanceWaiting,
        reason: 'advance-waiting-no-display-ready-content',
      });
      logChainPlaceholderStuckTrace({
        phase: 'placeholder-shown',
        source: 'NotificationQueueShell-render',
        blockReason: 'advance-waiting-no-content',
        chainAdvanceWaiting: advanceWaiting,
        hasContent,
        hasRenderableChildren: hasRenderableChildrenProbe,
        childProbeRenderable,
        checkCardReady,
        incomingCardReady,
        kind: shellKind,
        displayBanId,
        renderBranch,
        ...renderTrace,
      });
    }
    if (advanceWaiting && hasContent && !hasRenderableChildrenProbe) {
      logChainPlaceholderStuckTrace({
        phase: 'shell-has-content-no-children',
        source: 'NotificationQueueShell-render',
        blockReason: 'advance-waiting-hasContent-but-no-renderable-children',
        chainAdvanceWaiting: advanceWaiting,
        hasContent,
        hasRenderableChildren: hasRenderableChildrenProbe,
        childProbeRenderable,
        checkCardReady,
        incomingCardReady,
        kind: shellKind,
        displayBanId,
        renderBranch,
        ...renderTrace,
      });
    }
  }, [advanceWaiting, displayBanId, hasContent, hasRenderableChildrenProbe, childProbeRenderable, checkCardReady, incomingCardReady, kind, renderBranch, renderTrace, sessionActive, shellKind]);

  if (advanceWaiting && !hasContent) {
    return (
      <ModalShell
        open
        light
        stable
        handoff={handoff}
        sessionHosted={sessionActive}
        zIndex={APP_NOTIFICATION_CARD_Z_INDEX}
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
      zIndex={APP_NOTIFICATION_CARD_Z_INDEX}
      closeOnBackdrop={false}
      ariaLabel={ARIA[shellKind]}
      onClose={() => {}}
      cardClassName={CARD_CLASS[shellKind]}
    >
      <div
        key={handoff ? undefined : (contentKey ?? kind)}
        className="notification-queue-shell__content"
      >
        {children}
      </div>
    </ModalShell>
  );
}
