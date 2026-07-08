'use client';

import { isPostSuccessHandoffInProgress } from './post-success-handoff-debug';
import { isReplyQueueHandoffSessionActive } from './reply-queue-handoff-debug';
import { traceQueueClaimsNotificationScreenIfChanged } from './queue-claims-notification-screen-trace-debug';
import { diagTraceNow, emitClientDiagTrace } from './diag-trace-client';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: diagTraceNow(), ...data };
  emitClientDiagTrace(event, payload);
}

export type QueueLobbyGuardSnapshot = {
  queueLen: number;
  pendingLen: number;
  fromQueueResult: boolean;
  queueShellShowsResult: boolean;
  phase: string;
  source?: string;
};

let guardSnapshot: QueueLobbyGuardSnapshot = {
  queueLen: 0,
  pendingLen: 0,
  fromQueueResult: false,
  queueShellShowsResult: false,
  phase: 'idle',
};

export function getQueueLobbyGuardSnapshot(): QueueLobbyGuardSnapshot {
  return { ...guardSnapshot };
}

export function resolveQueueLobbyPhase(input: {
  queueLen: number;
  queueShellShowsResult: boolean;
  fromQueueResult: boolean;
  displayResultSourcePicked?: string | null;
}): string {
  if (input.queueShellShowsResult) return 'queueShellShowsResult';
  if (input.displayResultSourcePicked === 'displayResult-via-result-state') {
    return 'displayResult-via-result-state';
  }
  if (isPostSuccessHandoffInProgress()) return 'post-success-handoff';
  if (isReplyQueueHandoffSessionActive()) return 'post-timer-handoff';
  if (input.fromQueueResult) return 'fromQueueResult';
  if (input.queueLen > 0) return 'queue-drain-active';
  return 'idle';
}

export function syncQueueLobbyGuardState(
  patch: Partial<QueueLobbyGuardSnapshot> & {
    displayResultSourcePicked?: string | null;
  },
): QueueLobbyGuardSnapshot {
  const queueLen = patch.queueLen ?? guardSnapshot.queueLen;
  const pendingLen = patch.pendingLen ?? guardSnapshot.pendingLen;
  const fromQueueResult =
    patch.fromQueueResult ?? guardSnapshot.fromQueueResult;
  const queueShellShowsResult =
    patch.queueShellShowsResult ?? guardSnapshot.queueShellShowsResult;
  const phase =
    patch.phase ??
    resolveQueueLobbyPhase({
      queueLen,
      queueShellShowsResult,
      fromQueueResult,
      displayResultSourcePicked: patch.displayResultSourcePicked,
    });
  guardSnapshot = {
    queueLen,
    pendingLen,
    fromQueueResult,
    queueShellShowsResult,
    phase,
    source: patch.source ?? guardSnapshot.source,
  };
  const queueLobbyGuardActive = shouldBlockLobbyForActiveQueue(guardSnapshot);
  traceQueueClaimsNotificationScreenIfChanged('queue-lobby-guard.syncQueueLobbyGuardState', {
    queueClaimsNotificationScreen:
      queueLen > 0 || queueLobbyGuardActive,
    overlayQueueLength: queueLen,
    ownerQueueLen: queueLen,
    ownerPendingLen: pendingLen,
    queueLobbyGuardActive,
    guardSnapshot,
    renderBranch: null,
    reason: queueLobbyGuardActive
      ? queueLen > 0
        ? 'guard-sync-queue-len-gt-0'
        : fromQueueResult
          ? 'guard-sync-from-queue-result'
          : queueShellShowsResult
            ? 'guard-sync-queue-shell-shows-result'
            : `guard-sync-phase-${phase}`
      : 'guard-sync-released',
  });
  return getQueueLobbyGuardSnapshot();
}

export function shouldBlockLobbyForActiveQueue(
  snapshot: QueueLobbyGuardSnapshot = guardSnapshot,
): boolean {
  return (
    snapshot.queueLen > 0 ||
    snapshot.fromQueueResult ||
    snapshot.queueShellShowsResult ||
    snapshot.phase === 'queueShellShowsResult'
  );
}

export function logLobbyOpenRejectedQueueActive(
  data: Record<string, unknown>,
): void {
  emit('[LOBBY OPEN REJECTED QUEUE ACTIVE]', data);
}

export function logQueueClaimedScreen(data: Record<string, unknown>): void {
  emit('[QUEUE CLAIMED SCREEN]', data);
}

export function logQueueBlockedByLobby(data: Record<string, unknown>): void {
  emit('[QUEUE BLOCKED BY LOBBY]', data);
}
