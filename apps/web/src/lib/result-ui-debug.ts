import type { InteractionOutcome } from '@98plus/shared';
import { RESULT_COPY } from '@98plus/shared';

export type ResultUiComponent =
  | 'ResultOverlay'
  | 'ActiveBanCardOverlay'
  | 'NotificationQueueShell'
  | 'OverboardResultOverlay';

/** Maps outcome → RESULT_COPY headline/subline (aka RESULT_PRESENTATION). */
export function resolveResultPresentation(
  outcome: InteractionOutcome | string | null | undefined,
): { headline: string; subline: string } | null {
  if (!outcome || !(outcome in RESULT_COPY)) return null;
  return RESULT_COPY[outcome as InteractionOutcome];
}

export function logResultPresentation(
  outcome: InteractionOutcome | string | null | undefined,
  data: {
    presentation?: { headline: string; subline: string } | null;
    component: ResultUiComponent;
    displayHeadline?: string;
    resultStatus?: string | null;
    resultType?: string | null;
    branch?: string;
    source?: string;
  },
): void {
  const mapped =
    data.presentation ?? resolveResultPresentation(outcome);
  console.log('[RESULT UI]');
  console.log('[RESULT UI] outcome=', outcome ?? '—');
  console.log(
    '[RESULT UI] presentation=',
    mapped ? `${mapped.headline} / ${mapped.subline}` : '—',
  );
  console.log('[RESULT UI] component=', data.component);
  if (data.displayHeadline != null) {
    console.log('[RESULT UI] displayHeadline=', data.displayHeadline);
  }
  if (data.resultStatus != null) {
    console.log('[RESULT UI] result.status=', data.resultStatus);
  }
  if (data.resultType != null) {
    console.log('[RESULT UI] result.type=', data.resultType);
  }
  if (data.branch) console.log('[RESULT UI] branch=', data.branch);
  if (data.source) console.log('[RESULT UI] source=', data.source);
}

export function logResultUi(
  status: InteractionOutcome | string | null | undefined,
  data: {
    overlayKind: string | null;
    compactCard: boolean;
    fullOverlay: boolean;
    source?: string;
    rejectReason?: string;
    overlayQueueLength?: number;
    resultDelivered?: boolean;
    shownOverlayKey?: boolean;
  },
): void {
  console.log('[RESULT UI] status=', status ?? '—');
  console.log('[RESULT UI] overlay kind=', data.overlayKind ?? '—');
  console.log('[RESULT UI] compact card=', data.compactCard);
  console.log('[RESULT UI] full overlay=', data.fullOverlay);
  if (data.source) console.log('[RESULT UI] source=', data.source);
  if (data.rejectReason) console.log('[RESULT UI] reject=', data.rejectReason);
  if (data.overlayQueueLength != null) {
    console.log('[RESULT UI] queueLength=', data.overlayQueueLength);
  }
  if (data.resultDelivered != null) {
    console.log('[RESULT UI] resultDelivered=', data.resultDelivered);
  }
  if (data.shownOverlayKey != null) {
    console.log('[RESULT UI] shownOverlayKey=', data.shownOverlayKey);
  }
}
