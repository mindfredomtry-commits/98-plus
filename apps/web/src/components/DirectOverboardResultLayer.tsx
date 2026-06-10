'use client';

import { useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import type { BanResult } from '@98plus/shared';
import { DIRECT_OVERBOARD_RESULT_Z_INDEX } from '@/lib/overlay-queue';
import { logResultOpenAttempt } from '@/lib/overlay-priority';
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
    logResultOpenAttempt('DirectOverboardResultLayer', {
      resultId: result.id,
      allowed: true,
      extra: { outcome: result.outcome },
    });
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
