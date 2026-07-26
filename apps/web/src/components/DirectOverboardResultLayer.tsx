'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { useApp } from './Providers';
import { createPortal } from 'react-dom';
import type { BanResult } from '@98plus/shared';
import { DIRECT_OVERBOARD_RESULT_Z_INDEX } from '@/lib/overlay-queue';
import {
  isLocalOverboardBypassForBan,
  logResultOpenAttempt,
} from '@/lib/overlay-priority';
import { logOverboardDirectState } from '@/lib/overboard-direct-state';
import { markVisibleOverboardTrace } from '@/lib/overboard-flow-debug';
import {
  logResultRenderBranch,
  logResultRenderSelectionTrace,
} from '@/lib/result-render-selection-trace';
import { getAppPortalRoot } from '@/lib/portal-root';
import { logResultPath } from '@/lib/result-open-trace';
import {
  clearOverboardFlashOriginEmitForBan,
  emitOverboardFlashOriginV1,
} from '@/lib/overboard-flash-origin-v1';
import { ResultOverlay } from './ResultOverlay';

type Props = {
  result: BanResult;
  onClose: () => void;
  /** Phase 12.1b: owner-derived architectural visibility. */
  visible: boolean;
  visibilityReason?: string;
  resultVisible: boolean;
  resultVisibilityReason?: string;
  resultReturnsNullReason?: string | null;
  resultOverboardQueueBody?: boolean;
};

function traceDirectLayerJsxBranch(
  branch: string,
  fields: Record<string, unknown>,
): void {
  markVisibleOverboardTrace('DIRECT OVERBOARD JSX BRANCH', { branch, ...fields });
  const renderBranch =
    branch === 'render-result-overlay-portal'
      ? 'result-overlay'
      : 'direct-overboard-null';
  logResultRenderBranch({
    component: 'DirectOverboardResultLayer',
    renderBranch,
    reason: branch,
    ...fields,
  });
}

/**
 * Fresh portal layer for optimistic overboard — does not reuse NotificationQueueShell DOM.
 */
export function DirectOverboardResultLayer({
  result,
  onClose,
  visible,
  visibilityReason,
  resultVisible,
  resultVisibilityReason,
  resultReturnsNullReason,
  resultOverboardQueueBody,
}: Props) {
  const {
    bansCtaQueueSuppress,
    resultCtaBansOverlayOpen,
    bansNavState,
  } = useApp();
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const resultCtaBansSessionRef = useRef(false);
  resultCtaBansSessionRef.current =
    bansCtaQueueSuppress ||
    resultCtaBansOverlayOpen ||
    (bansNavState.origin === 'result-cta' &&
      bansNavState.returnTarget === 'lobby');

  const viewerId = result.viewerId ?? null;

  const jsxFields = {
    active: visible,
    hasResult: true,
    resultBanId: result.id,
    refActive: visible,
    willRender: visible,
    outcome: result.outcome,
    showable: visible,
    visibilityReason: visibilityReason ?? null,
    contentOnly: false,
    embedded: true,
    portalReady: portalTarget != null,
  };

  logResultRenderSelectionTrace({
    effectiveKind: 'result',
    shellKind: 'result',
    activeResultId: result.id,
    resultBanId: result.id,
    resultId: result.id,
    hasResult: true,
    hasResultOverlay: visible && portalTarget != null,
    displayResultExists: Boolean(result.id?.trim()),
    willRenderResultOverlay: visible && portalTarget != null && resultVisible,
    willRenderNotificationOverlay: false,
    renderBranch: visible && portalTarget != null ? 'result-overlay' : 'direct-overboard-null',
    reason: !visible
      ? (visibilityReason ?? 'not-visible')
      : !portalTarget
        ? 'no-portal-target'
        : 'will-render',
  });

  const directLayerBranch = !visible
    ? 'return-null-not-visible'
    : !portalTarget
      ? 'return-null-no-portal-target'
      : 'render-result-overlay-portal';
  console.log('ACTUAL_COMPONENT_RENDER: DirectOverboardResultLayer', {
    t: performance.now(),
    active: visible,
    hasResult: true,
    resultBanId: result.id,
    portalReady: portalTarget != null,
    willRender: visible && portalTarget != null,
    branch: directLayerBranch,
    showable: visible,
  });

  useLayoutEffect(() => {
    const target = getAppPortalRoot();
    setPortalTarget(target);
    markVisibleOverboardTrace('DIRECT LAYER portal-target', {
      banId: result.id,
      tagName: target?.tagName ?? null,
      targetNull: target == null,
      bodyChildCount: document.body?.childElementCount ?? null,
    });
  }, [result.id]);

  useLayoutEffect(() => {
    if (!visible || !portalTarget || !resultVisible) return;
    emitOverboardFlashOriginV1({
      result,
      mountSurface: 'DirectOverboardResultLayer',
      resultOverlayVisible: resultVisible,
      directOverboardVisible: visible,
      directOverboardRenderForcedByQueueResult:
        visibilityReason === 'forced-by-queue-result',
    });
  }, [
    portalTarget,
    result,
    resultVisible,
    visible,
    visibilityReason,
  ]);

  useLayoutEffect(() => {
    return () => {
      clearOverboardFlashOriginEmitForBan(result.id);
    };
  }, [result.id]);

  useLayoutEffect(() => {
    logResultOpenAttempt('direct-overboard-result', {
      resultId: result.id,
      allowed: true,
      bypassPriorityLock: isLocalOverboardBypassForBan(result.id),
      extra: { outcome: result.outcome, phase: 'mounted' },
    });
    logResultPath('DirectOverboardResultLayer', 'state-written', {
      banId: result.id,
      resultId: result.id,
      allowed: true,
      bypassPriorityLock: isLocalOverboardBypassForBan(result.id),
      extra: { mounted: true, outcome: result.outcome },
    });
    markVisibleOverboardTrace('DIRECT OVERBOARD LAYER mounted=true', {
      banId: result.id,
      outcome: result.outcome,
      portalTarget: portalTarget?.tagName ?? null,
    });
    console.log('[DIRECT OVERBOARD LAYER] mounted=true', {
      banId: result.id,
      outcome: result.outcome,
    });
    logOverboardDirectState(
      'DirectOverboardResultLayer mounted=true',
      {
        directResultOverlayActive: true,
        directResultOverlayRef: true,
        resultOpenRef: true,
        resultBanId: result.id,
        activeOverlayKind: 'result',
        overboardInFlightBanId: result.id,
        localBypassBanId: null,
        priorityLocked: false,
        showDirectOverboardLayer: true,
        displayResultBanId: result.id,
      },
      { mounted: true },
    );
  }, [portalTarget, result.id, result.outcome]);

  useLayoutEffect(() => {
    return () => {
      if (!resultCtaBansSessionRef.current) return;
      markVisibleOverboardTrace('RESULT OVERLAY CLEANUP SKIPPED', {
        reason: 'result-cta-bans-open',
        effect: 'direct-layer-unmount',
        banId: result.id,
      });
    };
  }, [result.id]);

  if (!visible) {
    traceDirectLayerJsxBranch('return-null-not-visible', jsxFields);
    return null;
  }

  if (!portalTarget) {
    traceDirectLayerJsxBranch('return-null-no-portal-target', jsxFields);
    return null;
  }

  traceDirectLayerJsxBranch('render-result-overlay-portal', jsxFields);

  markVisibleOverboardTrace('ABOUT TO RENDER RESULT OVERLAY', {
    active: jsxFields.active,
    hasResult: jsxFields.hasResult,
    resultBanId: result.id,
    refActive: jsxFields.refActive,
    willRender: jsxFields.willRender,
    outcome: result.outcome,
    showable: visible,
    contentOnly: false,
    embedded: true,
    directPaint: true,
    viewerId,
    senderId: result.sender?.id ?? null,
    receiverId: result.receiver?.id ?? null,
  });

  return createPortal(
    <div
      className="direct-overboard-result-layer"
      style={{ zIndex: DIRECT_OVERBOARD_RESULT_Z_INDEX }}
      data-direct-overboard-result=""
    >
      <ResultOverlay
        result={result}
        onClose={onClose}
        embedded
        directPaint
        visible={resultVisible}
        visibilityReason={resultVisibilityReason}
        returnsNullReason={resultReturnsNullReason}
        overboardQueueBody={resultOverboardQueueBody}
      />
    </div>,
    portalTarget,
  );
}
