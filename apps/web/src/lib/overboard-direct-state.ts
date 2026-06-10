import { traceOverboardFlow } from '@/lib/overboard-flow-debug';
import { logResultOpenAttempt } from '@/lib/overlay-priority';
import { logResultPath } from '@/lib/result-open-trace';

export type OverboardDirectStateSnapshot = {
  directResultOverlayActive: boolean;
  directResultOverlayRef: boolean;
  resultOpenRef: boolean;
  resultBanId: string | null;
  activeOverlayKind: string | null;
  overboardInFlightBanId: string | null;
  localBypassBanId: string | null;
  priorityLocked: boolean;
  showDirectOverboardLayer: boolean;
  displayResultBanId: string | null;
};

/** Visible in console + OVERBOARD FLOW TRACE + RESULT OPEN TRACE. */
export function logOverboardDirectState(
  label: string,
  snapshot: OverboardDirectStateSnapshot,
  extra?: Record<string, unknown>,
): void {
  const row = { label, ...snapshot, ...extra };
  console.log('[OVERBOARD DIRECT STATE]', row);
  traceOverboardFlow(`direct-state:${label}`, row);
  logResultPath('overboard-direct-state', 'attempt', {
    banId: snapshot.resultBanId,
    resultId: snapshot.resultBanId,
    allowed: snapshot.showDirectOverboardLayer,
    extra: row,
  });
  logResultOpenAttempt('overboard-direct-state', {
    resultId: snapshot.resultBanId,
    allowed: snapshot.showDirectOverboardLayer,
    bypassPriorityLock: snapshot.localBypassBanId != null,
    extra: { ...row, phase: 'direct-state' },
  });
}
