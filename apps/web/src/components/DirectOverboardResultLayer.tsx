'use client';

import { useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import type { BanResult } from '@98plus/shared';
import { DIRECT_OVERBOARD_RESULT_Z_INDEX } from '@/lib/overlay-queue';
import {
  isLocalOverboardBypassForBan,
  logResultOpenAttempt,
} from '@/lib/overlay-priority';
import { logOverboardDirectState } from '@/lib/overboard-direct-state';
import { markVisibleOverboardTrace } from '@/lib/overboard-flow-debug';
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
  }, [result.id, result.outcome]);

  if (typeof document === 'undefined') return null;

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
    document.body,
  );
}
