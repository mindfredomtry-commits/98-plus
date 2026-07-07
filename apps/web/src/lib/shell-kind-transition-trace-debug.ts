'use client';

import type { EmptyHostBugQueueItemSnapshot } from './empty-host-bug-trace-debug';

export type ShellKindTransitionTrace = {
  previousShellKind: string | null;
  nextShellKind: string | null;
  previousQueueHeadKind: string | null;
  nextQueueHeadKind: string | null;
  caller: string;
  source: string;
  reason: string;
  ownerQueueLen: number;
  ownerPendingLen: number;
  activeKind: string | null;
  effectiveKind: string | null;
  displayKind: string | null;
  selectedBanId: string | null;
  selectedResultId: string | null;
  ownerQueueHead: EmptyHostBugQueueItemSnapshot;
  ownerPendingHead: EmptyHostBugQueueItemSnapshot;
  notificationSessionActive: boolean;
  notificationChainTransitioning: boolean;
  visualQueueDimSession: boolean;
  visualQueueDimSessionRef: boolean;
  renderBranch: string | null;
  decisionReason: string;
};

export function resolveShellKindTransitionDecisionReason(input: {
  nextShellKind: string | null;
  ownerQueueLen: number;
  ownerPendingLen: number;
  visualQueueDimSessionRef: boolean;
}): string {
  if (input.nextShellKind != null) {
    return 'shell-kind-set';
  }
  if (
    input.ownerQueueLen > 0 ||
    input.ownerPendingLen > 0 ||
    input.visualQueueDimSessionRef
  ) {
    return 'SHELL_KIND_DROPPED_DURING_ACTIVE_VISUAL_QUEUE';
  }
  return 'shell-kind-cleared';
}

export function logShellKindTransitionTrace(trace: ShellKindTransitionTrace): void {
  const payload = { timestamp: performance.now(), ...trace };
  console.log('SHELL_KIND_TRANSITION_TRACE', payload);
  window.__debug98log?.('SHELL_KIND_TRANSITION_TRACE', payload);
}
