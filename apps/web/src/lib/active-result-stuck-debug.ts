'use client';

function emit(event: string, data: Record<string, unknown>): void {
  const timestamp = performance.now();
  const payload = { timestamp, t: timestamp, ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export type ActiveResultStuckWithQueuePayload = {
  ownerQueueLen: number;
  ownerPendingLen: number;
  activeKind: string | null;
  activeBanId: string | null;
  activeResultId: string | null;
  displayKind: string | null;
  displayResultId: string | null;
  mountedOverlayKind: string | null;
  notificationOverlayVisible: boolean;
  goToBansAdvancePending: boolean;
  chainAdvanceAwaiting: boolean;
  goToBansClosingBanId: string | null;
  resultConsumed: boolean;
  resultOverlayConsumed: boolean;
  lastNavigateFromResultBranch: string | null;
  lastNavigateFromResultReturnReason: string | null;
  timestamp?: number;
};

export function logActiveResultStuckWithQueue(
  data: ActiveResultStuckWithQueuePayload,
): void {
  emit('ACTIVE_RESULT_STUCK_WITH_QUEUE', data);
}

export function buildActiveResultStuckSignature(
  data: ActiveResultStuckWithQueuePayload,
): string {
  return [
    data.ownerQueueLen,
    data.ownerPendingLen,
    data.activeKind ?? '',
    data.activeBanId ?? '',
    data.displayKind ?? '',
    data.goToBansAdvancePending ? '1' : '0',
    data.chainAdvanceAwaiting ? '1' : '0',
    data.goToBansClosingBanId ?? '',
    data.notificationOverlayVisible ? '1' : '0',
  ].join('|');
}

export type ActiveResultClearDecisionPayload = {
  source: string;
  action: string;
  beforeActiveKind: string | null;
  afterActiveKind: string | null;
  beforeQueueLen: number;
  afterQueueLen: number;
  didClearActive: boolean;
  didClearDisplay: boolean;
  didMarkConsumed: boolean;
  skipReason: string | null;
  timestamp?: number;
};

export function logActiveResultClearDecision(
  data: ActiveResultClearDecisionPayload,
): void {
  emit('ACTIVE_RESULT_CLEAR_DECISION', data);
}
