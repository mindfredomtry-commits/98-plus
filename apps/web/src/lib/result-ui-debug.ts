import type { InteractionOutcome } from '@98plus/shared';

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
