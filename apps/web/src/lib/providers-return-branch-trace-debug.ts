'use client';

import {
  diagTraceNow,
  emitClientDiagTrace,
  isClientDiagTraceEnvironment,
} from '@/lib/diag-trace-client';

export type ProvidersReturnBranchTrace = {
  timestamp: number;
  branchId: string;
  functionName: string;
  renderBranch: string | null;
  shellKind: string | null;
  effectiveKind: string | null;
  actualKind: string | null;
  queueHeadKind: string | null;
  overlayQueueLength: number;
  ownerQueueLen: number;
  notificationHostMounted: boolean | null;
  notificationOverlayVisible: boolean;
  visualQueueDimSessionLive: boolean;
  reason: string | null;
};

export type ProvidersReturnBranchTraceInput = {
  branchId: string;
  functionName: string;
  renderBranch?: string | null;
  shellKind?: string | null;
  effectiveKind?: string | null;
  actualKind?: string | null;
  queueHeadKind?: string | null;
  overlayQueueLength?: number;
  ownerQueueLen?: number;
  notificationHostMounted?: boolean | null;
  notificationOverlayVisible?: boolean;
  visualQueueDimSessionLive?: boolean;
  reason?: string | null;
};

export function logProvidersReturnBranchTrace(
  input: ProvidersReturnBranchTraceInput,
): void {
  if (!isClientDiagTraceEnvironment()) return;
  const payload: ProvidersReturnBranchTrace = {
    timestamp: diagTraceNow(),
    branchId: input.branchId,
    functionName: input.functionName,
    renderBranch: input.renderBranch ?? null,
    shellKind: input.shellKind ?? null,
    effectiveKind: input.effectiveKind ?? null,
    actualKind: input.actualKind ?? null,
    queueHeadKind: input.queueHeadKind ?? null,
    overlayQueueLength: input.overlayQueueLength ?? 0,
    ownerQueueLen: input.ownerQueueLen ?? 0,
    notificationHostMounted: input.notificationHostMounted ?? null,
    notificationOverlayVisible: input.notificationOverlayVisible ?? false,
    visualQueueDimSessionLive: input.visualQueueDimSessionLive ?? false,
    reason: input.reason ?? null,
  };
  emitClientDiagTrace('PROVIDERS_RETURN_BRANCH_TRACE', payload);
}
