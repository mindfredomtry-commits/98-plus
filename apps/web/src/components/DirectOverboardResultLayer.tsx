'use client';

import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { BanResult } from '@98plus/shared';
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

/**
 * Fresh portal layer for optimistic overboard — does not reuse NotificationQueueShell DOM.
 */
export function DirectOverboardResultLayer({ result, onClose }: Props) {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

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

  if (!portalTarget) return null;

  return createPortal(
    <div
      className="direct-overboard-result-layer"
      style={{ zIndex: DIRECT_OVERBOARD_RESULT_Z_INDEX }}
      data-direct-overboard-result=""
    >
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: DIRECT_OVERBOARD_RESULT_Z_INDEX,
          pointerEvents: 'none',
          color: 'red',
          fontSize: '14px',
          fontWeight: 700,
          padding: '8px',
          textShadow: '0 0 4px #000',
        }}
      >
        DIRECT LAYER IS VISIBLE
      </div>
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
