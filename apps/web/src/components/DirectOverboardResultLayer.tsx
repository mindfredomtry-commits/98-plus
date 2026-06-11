'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { useApp } from './Providers';
import { createPortal } from 'react-dom';
import type { BanResult } from '@98plus/shared';
import {
  isDirectOverboardOpenable,
  isValidBanResultPayload,
} from '@98plus/shared';
import { DIRECT_OVERBOARD_RESULT_Z_INDEX } from '@/lib/overlay-queue';
import {
  isLocalOverboardBypassForBan,
  logResultOpenAttempt,
} from '@/lib/overlay-priority';
import { logOverboardDirectState } from '@/lib/overboard-direct-state';
import { markVisibleOverboardTrace } from '@/lib/overboard-flow-debug';
import { getAppPortalRoot } from '@/lib/portal-root';
import { logResultPath } from '@/lib/result-open-trace';
import { ResultOverlay } from './ResultOverlay';

type Props = {
  result: BanResult;
  onClose: () => void;
};

function traceDirectLayerJsxBranch(
  branch: string,
  fields: Record<string, unknown>,
): void {
  markVisibleOverboardTrace('DIRECT OVERBOARD JSX BRANCH', { branch, ...fields });
}

/**
 * Fresh portal layer for optimistic overboard — does not reuse NotificationQueueShell DOM.
 */
export function DirectOverboardResultLayer({ result, onClose }: Props) {
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
  const showable =
    isDirectOverboardOpenable(result, viewerId) ||
    isValidBanResultPayload(result);

  const jsxFields = {
    active: true,
    hasResult: true,
    resultBanId: result.id,
    refActive: true,
    willRender: true,
    outcome: result.outcome,
    showable,
    contentOnly: false,
    embedded: true,
    portalReady: portalTarget != null,
  };

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
    showable,
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
      />
    </div>,
    portalTarget,
  );
}
