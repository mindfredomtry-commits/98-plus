'use client';

import { Children, isValidElement, useEffect, useLayoutEffect, type ReactNode } from 'react';
import { ModalShell } from './ModalShell';
import { APP_NOTIFICATION_CARD_Z_INDEX } from '@/lib/overlay-queue';
import {
  logChainPlaceholderDecisionDiag,
  logChainPlaceholderStuckTrace,
  logCheckTransitionPlaceholderDecision,
  logNotificationQueueShellRenderTrace,
  logQueueHeadNotReady,
  logQueuePlaceholderBlocked,
} from '@/lib/check-chain-drain-debug';
import {
  logResultRenderBranch,
  logResultRenderSelectionTrace,
  resolveOverlayRenderBranchFromKind,
} from '@/lib/result-render-selection-trace';

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

function resolveChildrenType(children: ReactNode): string {
  const nodes = Children.toArray(children).filter(
    (child) => child != null && child !== false,
  );
  if (nodes.length === 0) return 'empty';
  const first = nodes[0];
  if (!isValidElement(first)) return typeof first;
  const type = first.type;
  if (typeof type === 'string') return type;
  if (typeof type === 'function') {
    return type.name || 'anonymous-function';
  }
  return 'unknown-element-type';
}

function ModalShellContentWrapper({
  kind,
  visible,
  hasContent,
  reason,
  contentKey,
  handoff,
  children,
}: {
  kind: OverlayKind;
  visible: boolean;
  hasContent: boolean;
  reason: string;
  contentKey: string | null;
  handoff: boolean;
  children: ReactNode;
}) {
  console.log('ACTUAL_COMPONENT_RENDER: ModalShellContentWrapper', {
    t: performance.now(),
    kind,
    visible,
    hasContent,
    childrenType: resolveChildrenType(children),
    reason,
  });
  return (
    <div
      key={handoff ? undefined : (contentKey ?? kind)}
      className="notification-queue-shell__content"
    >
      {children}
    </div>
  );
}

function isAdvanceHeadReady(
  kind: OverlayKind,
  incomingCardReady: boolean,
  checkCardReady: boolean,
  shellContentReady: boolean | undefined,
): boolean {
  if (kind === 'incoming') return incomingCardReady;
  if (kind === 'check') return checkCardReady;
  return shellContentReady === true;
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
  const rt = renderTrace ?? {};
  const queueHeadKindFromTrace =
    (rt.overlayQueueHeadKind as string | null | undefined) ?? null;
  const queueHeadBanIdFromTrace =
    (rt.overlayQueueHeadBanId as string | null | undefined)?.trim() ?? '';
  const queueHeadShellAdvanceReady =
    queueHeadBanIdFromTrace.length > 0 &&
    (queueHeadKindFromTrace === 'check' ||
      queueHeadKindFromTrace === 'incoming' ||
      queueHeadKindFromTrace === 'result');
  const childProbeRenderable =
    kind === 'check'
      ? checkCardReady && hasRenderableChildrenProbe
      : hasRenderableChildrenProbe;
  const hasContent =
    shellContentReady !== undefined ? shellContentReady : childProbeRenderable;
  const hasContentForAdvance =
    hasContent || (advanceWaiting && queueHeadShellAdvanceReady);

  const advanceHeadReady =
    kind != null &&
    isAdvanceHeadReady(kind, incomingCardReady, checkCardReady, shellContentReady);
  const effectiveAdvanceHeadReady =
    advanceHeadReady ||
    (advanceWaiting && queueHeadShellAdvanceReady);

  const resolveRenderBranch = (): string => {
    if (!kind) return 'return-null-no-kind';
    if (kind === 'incoming' && !incomingCardReady && !advanceWaiting) {
      return 'return-null-incoming-not-ready';
    }
    if (kind === 'check' && !checkCardReady && !advanceWaiting) {
      return 'return-null-check-not-ready';
    }
    if (advanceWaiting && !effectiveAdvanceHeadReady) {
      return 'return-null-advance-head-not-ready';
    }
    if (!hasContent && !advanceWaiting) {
      return 'return-null-no-content-no-advance';
    }
    if (advanceWaiting && !hasContentForAdvance) {
      return 'return-null-advance-no-content';
    }
    return 'modal-shell-content-wrapper';
  };

  const renderBranch = resolveRenderBranch();

  const queueHeadAdvanceMounted =
    advanceWaiting &&
    effectiveAdvanceHeadReady &&
    renderBranch === 'modal-shell-content-wrapper' &&
    ((kind === 'check' && checkCardReady) ||
      (kind === 'incoming' && incomingCardReady));
  const resolvedShellReason =
    queueHeadAdvanceMounted && kind === 'check'
      ? 'queue-head-check-advance-mounted'
      : queueHeadAdvanceMounted && kind === 'incoming'
        ? 'queue-head-incoming-advance-mounted'
        : renderBranch;

  const effectiveKind =
    (rt.effectiveNotificationQueueShellKind as string | null | undefined) ??
    kind;
  const queueHeadKind =
    (rt.overlayQueueHeadKind as string | null | undefined) ?? null;
  const queueHeadBanId =
    (rt.overlayQueueHeadBanId as string | null | undefined) ?? null;
  const queueHeadResultId =
    queueHeadKind === 'result' ? queueHeadBanId : null;
  const activeResultPayloadBanId =
    (rt.activeResultPayloadBanId as string | null | undefined) ?? null;
  const queueLen = (rt.queueLen as number | null | undefined) ?? 0;
  const pendingLen = (rt.pendingLen as number | null | undefined) ?? 0;
  const childrenBranch =
    (rt.childrenBranch as string | null | undefined) ?? null;
  const queueShellShowsResult = childrenBranch === 'result';
  const willRenderShellModal = renderBranch === 'modal-shell-content-wrapper';
  const overlayRenderBranch = resolveOverlayRenderBranchFromKind(kind);
  const willRenderResultOverlay =
    kind === 'result' && willRenderShellModal && hasContent;
  const willRenderNotificationOverlay =
    kind != null && willRenderShellModal && hasContent;

  logResultRenderSelectionTrace({
    activeOverlayKind:
      (rt.activeOverlayKind as string | null | undefined) ??
      (rt.overlayQueueHeadKind as string | null | undefined) ??
      kind,
    activeKind:
      (rt.activeOverlayKind as string | null | undefined) ??
      (rt.overlayQueueHeadKind as string | null | undefined) ??
      kind,
    effectiveKind,
    shellKind: kind,
    activeBanId: displayBanId,
    activeResultId: activeResultPayloadBanId,
    resultBanId: activeResultPayloadBanId,
    resultId: activeResultPayloadBanId,
    hasResult: queueShellShowsResult || kind === 'result',
    hasResultOverlay: queueShellShowsResult,
    hasNotificationOverlay: Boolean(rt.shouldMountNotificationOverlayHost),
    hasAnyOverlay: kind != null,
    displayResultExists: Boolean(activeResultPayloadBanId),
    willRenderResultOverlay,
    willRenderNotificationOverlay,
    willRenderLobby: false,
    overlayQueueLength: queueLen,
    pendingLen,
    queueHeadKind,
    queueHeadBanId,
    queueHeadResultId,
    queueClaimsNotificationScreen: queueLen > 0 || pendingLen > 0,
    showLobby: undefined,
    showLobbyCta: undefined,
    renderBranch: willRenderShellModal
      ? overlayRenderBranch
      : kind
        ? overlayRenderBranch
        : 'base-null',
    reason: resolvedShellReason,
  });

  console.log('ACTUAL_COMPONENT_RENDER: NotificationQueueShell', {
    t: performance.now(),
    kind,
    effectiveKind,
    renderBranch,
    childrenBranch,
    hasChildren: hasRenderableChildrenProbe,
    willRenderResultOverlay,
    queueLen,
    pendingLen,
  });

  const logShellRenderBranch = (branch: string, reason: string) => {
    logResultRenderBranch({
      component: 'NotificationQueueShell',
      renderBranch: branch,
      reason,
      internalBranch: renderBranch,
      kind,
      shellKind: kind,
      effectiveKind,
      hasContent,
      incomingCardReady,
      checkCardReady,
      advanceWaiting,
      childrenBranch,
    });
  };

  useLayoutEffect(() => {
    logNotificationQueueShellRenderTrace({
      kind,
      displayKind: kind,
      shellContentReady: shellContentReady ?? null,
      hasRenderableChildren: hasRenderableChildrenProbe,
      hasContent,
      advanceWaiting,
      advanceHeadReady: effectiveAdvanceHeadReady,
      queueHeadShellAdvanceReady,
      renderBranch: resolvedShellReason,
      queueHeadAdvanceMounted,
      sessionActive,
      displayBanId,
      contentKey,
      incomingCardReady,
      checkCardReady,
      childProbeRenderable,
      ...renderTrace,
    });
  }, [
    advanceHeadReady,
    effectiveAdvanceHeadReady,
    advanceWaiting,
    checkCardReady,
    childProbeRenderable,
    contentKey,
    displayBanId,
    hasContent,
    hasContentForAdvance,
    hasRenderableChildrenProbe,
    incomingCardReady,
    kind,
    queueHeadShellAdvanceReady,
    queueHeadAdvanceMounted,
    renderBranch,
    resolvedShellReason,
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

  const handoff = sessionActive;
  const shellKind = kind ?? 'incoming';

  useLayoutEffect(() => {
    if (!kind) return;
    if (kind === 'incoming' && !incomingCardReady && !advanceWaiting) return;
    if (kind === 'check' && !checkCardReady && !advanceWaiting) return;
    if (advanceWaiting && !effectiveAdvanceHeadReady) {
      logQueueHeadNotReady({
        source: 'NotificationQueueShell-render',
        reason: !hasContentForAdvance ? 'advance-waiting-no-content' : 'advance-waiting-head-not-ready',
        kind: shellKind,
        hasContent,
        hasContentForAdvance,
        advanceHeadReady: effectiveAdvanceHeadReady,
        queueHeadShellAdvanceReady,
        displayBanId,
        queueLen: (renderTrace?.queueLen as number | null | undefined) ?? null,
        currentHead:
          (renderTrace?.overlayQueueHeadKind as string | null | undefined) ?? null,
        nextHead:
          (renderTrace?.pendingStartupHeadKind as string | null | undefined) ?? null,
        banId: displayBanId,
        renderBranch,
        ...renderTrace,
      });
      if (!hasContentForAdvance) {
        logQueuePlaceholderBlocked({
          source: 'NotificationQueueShell-render',
          reason: 'advance-waiting-no-content',
          kind: shellKind,
          queueLen: (renderTrace?.queueLen as number | null | undefined) ?? null,
          currentHead:
            (renderTrace?.overlayQueueHeadKind as string | null | undefined) ?? null,
          nextHead:
            (renderTrace?.pendingStartupHeadKind as string | null | undefined) ?? null,
          banId: displayBanId,
          renderBranch,
        });
      }
      return;
    }
    if (!hasContent && !advanceWaiting) return;
    if (!advanceWaiting && hasContent) return;
    logCheckTransitionPlaceholderDecision({
      source: 'NotificationQueueShell-render',
      chainAdvanceWaiting: advanceWaiting,
      notificationChainTransitioning: sessionActive,
      shouldShowPlaceholder: false,
      reason:
        advanceWaiting && hasContent
          ? 'advance-waiting-with-ready-content'
          : 'no-advance-waiting',
      kind: shellKind,
      hasContent,
      displayBanId,
    });
    logChainPlaceholderDecisionDiag({
      source: 'NotificationQueueShell-render',
      phase: renderBranch,
      shellKind,
      effectiveKind:
        (renderTrace?.effectiveNotificationQueueShellKind as string | null | undefined) ??
        kind,
      advanceWaiting,
      hasContent,
      advanceHeadReady: effectiveAdvanceHeadReady,
      queueHeadShellAdvanceReady,
      hasContentForAdvance,
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
        advanceWaiting && !effectiveAdvanceHeadReady
          ? 'advance-head-not-ready'
          : null,
      renderBranch,
      checkCardReady,
      incomingCardReady,
      chainAdvancePlaceholderKind:
        renderTrace?.chainAdvancePlaceholderKind ?? null,
    });
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
  }, [
    advanceHeadReady,
    advanceWaiting,
    checkCardReady,
    displayBanId,
    hasContent,
    hasRenderableChildrenProbe,
    childProbeRenderable,
    incomingCardReady,
    kind,
    renderBranch,
    renderTrace,
    sessionActive,
    shellKind,
  ]);

  if (!kind) {
    logShellRenderBranch('base-null', 'no-kind');
    return null;
  }

  if (kind === 'incoming' && !incomingCardReady && !advanceWaiting) {
    logShellRenderBranch('incoming-overlay', 'incoming-not-ready');
    return null;
  }

  if (kind === 'check' && !checkCardReady && !advanceWaiting) {
    logShellRenderBranch('check-overlay', 'check-not-ready');
    return null;
  }

  if (advanceWaiting && !effectiveAdvanceHeadReady) {
    logShellRenderBranch(
      resolveOverlayRenderBranchFromKind(kind),
      'advance-head-not-ready',
    );
    return null;
  }

  if (!hasContent && !advanceWaiting) {
    logShellRenderBranch(
      resolveOverlayRenderBranchFromKind(kind),
      'no-content-no-advance',
    );
    return null;
  }

  if (advanceWaiting && !hasContentForAdvance) {
    logShellRenderBranch(
      resolveOverlayRenderBranchFromKind(kind),
      'advance-no-content',
    );
    return null;
  }

  logShellRenderBranch(
    resolveOverlayRenderBranchFromKind(kind),
    resolvedShellReason,
  );

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
      <ModalShellContentWrapper
        kind={shellKind}
        visible
        hasContent={hasContent}
        reason={renderBranch}
        contentKey={contentKey}
        handoff={handoff}
      >
        {children}
      </ModalShellContentWrapper>
    </ModalShell>
  );
}
