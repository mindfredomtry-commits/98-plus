'use client';

function emit(event: string, data: Record<string, unknown>): void {
  const timestamp = performance.now();
  const payload = { timestamp, t: timestamp, ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export type ClearStaleActiveResultGuardStage =
  | 'entry'
  | 'skip-kind'
  | 'skip-ban-mismatch'
  | 'skip-key-mismatch'
  | 'skip-consumed-guard'
  | 'skip-direct-layer'
  | 'skip-owner-guard'
  | 'will-clear'
  | 'after-clear';

export type ClearStaleActiveResultGuardTracePayload = {
  stage: ClearStaleActiveResultGuardStage;
  source: string;
  reason: string;
  expectedKind: string;
  expectedBanId: string | null;
  expectedResultId: string | null;
  activeKindBefore: string | null;
  activeBanIdBefore: string | null;
  activeResultIdBefore: string | null;
  activeOverlayKeyBefore: string | null;
  displayKindBefore: string | null;
  displayBanIdBefore: string | null;
  displayResultIdBefore: string | null;
  directLayerActive: boolean;
  directLayerBanId: string | null;
  directLayerResultId: string | null;
  resultConsumed: boolean;
  resultOverlayConsumed: boolean;
  ownerQueueLen: number;
  ownerPendingLen: number;
  ownerQueueHeadKind: string | null;
  ownerQueueHeadBanId: string | null;
  ownerQueueHeadResultId: string | null;
  didClearActive?: boolean;
  didClearDisplay?: boolean;
  activeKindAfter: string | null;
  activeBanIdAfter: string | null;
  activeResultIdAfter: string | null;
  timestamp?: number;
};

export function logClearStaleActiveResultGuardTrace(
  data: ClearStaleActiveResultGuardTracePayload,
): void {
  emit('CLEAR_STALE_ACTIVE_RESULT_GUARD_TRACE', data);
}
