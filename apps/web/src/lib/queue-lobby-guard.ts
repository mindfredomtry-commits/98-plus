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

export type QueueLobbyGuardVisualEmptiness = {
  overlayQueueLength?: number;
  ownerQueueLen?: number;
  ownerPendingLen?: number;
  resultOverlayMounted?: boolean;
  directOverboardMounted?: boolean;
  visualQueueDimSessionLive?: boolean | null;
};

let guardSnapshot: QueueLobbyGuardSnapshot = {
  queueLen: 0,
  pendingLen: 0,
  fromQueueResult: false,
  queueShellShowsResult: false,
  phase: 'idle',
};

/** Last visualQueueDimSessionLive seen by sync (Providers). InstantBanFlow may read it. */
let lastKnownVisualQueueDimSessionLive: boolean | null = null;

export function getQueueLobbyGuardSnapshot(): QueueLobbyGuardSnapshot {
  return { ...guardSnapshot };
}

export function getLastKnownVisualQueueDimSessionLive(): boolean | null {
  return lastKnownVisualQueueDimSessionLive;
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

function shouldReleaseStaleQueueLobbyGuard(input: {
  overlayQueueLength: number;
  ownerQueueLen: number;
  ownerPendingLen: number;
  resultOverlayMounted: boolean | undefined;
  directOverboardMounted: boolean | undefined;
}): boolean {
  if (input.overlayQueueLength !== 0) return false;
  if (input.ownerQueueLen !== 0) return false;
  if (input.ownerPendingLen !== 0) return false;
  if (input.resultOverlayMounted !== false) return false;
  if (input.directOverboardMounted === true) return false;
  return true;
}

/** Empty queues + stale fromQueueResult, but never during live visual queue session. */
function shouldReleaseStaleFromQueueResult(input: {
  overlayQueueLength: number;
  ownerQueueLen: number;
  ownerPendingLen: number;
  fromQueueResult: boolean;
  visualQueueDimSessionLive: boolean | null | undefined;
}): boolean {
  if (!input.fromQueueResult) return false;
  if (input.overlayQueueLength !== 0) return false;
  if (input.ownerQueueLen !== 0) return false;
  if (input.ownerPendingLen !== 0) return false;
  if (input.visualQueueDimSessionLive === true) return false;
  return true;
}

export function syncQueueLobbyGuardState(
  patch: Partial<QueueLobbyGuardSnapshot> &
    QueueLobbyGuardVisualEmptiness & {
      displayResultSourcePicked?: string | null;
    },
): QueueLobbyGuardSnapshot {
  const queueLen = patch.queueLen ?? guardSnapshot.queueLen;
  const pendingLen = patch.pendingLen ?? guardSnapshot.pendingLen;
  let fromQueueResult =
    patch.fromQueueResult ?? guardSnapshot.fromQueueResult;
  let queueShellShowsResult =
    patch.queueShellShowsResult ?? guardSnapshot.queueShellShowsResult;
  let phase =
    patch.phase ??
    resolveQueueLobbyPhase({
      queueLen,
      queueShellShowsResult,
      fromQueueResult,
      displayResultSourcePicked: patch.displayResultSourcePicked,
    });

  const overlayQueueLength = patch.overlayQueueLength ?? queueLen;
  const ownerQueueLen = patch.ownerQueueLen ?? queueLen;
  const ownerPendingLen = patch.ownerPendingLen ?? pendingLen;
  const resultOverlayMounted = patch.resultOverlayMounted;
  const directOverboardMounted = patch.directOverboardMounted;
  const visualQueueDimSessionLive =
    patch.visualQueueDimSessionLive !== undefined
      ? patch.visualQueueDimSessionLive
      : lastKnownVisualQueueDimSessionLive;
  if (patch.visualQueueDimSessionLive !== undefined) {
    lastKnownVisualQueueDimSessionLive =
      patch.visualQueueDimSessionLive === null
        ? null
        : patch.visualQueueDimSessionLive === true;
  }

  const previousQueueLobbyGuardActive = shouldBlockLobbyForActiveQueue({
    queueLen,
    pendingLen,
    fromQueueResult,
    queueShellShowsResult,
    phase,
  });

  if (
    previousQueueLobbyGuardActive &&
    shouldReleaseStaleQueueLobbyGuard({
      overlayQueueLength,
      ownerQueueLen,
      ownerPendingLen,
      resultOverlayMounted,
      directOverboardMounted,
    })
  ) {
    fromQueueResult = false;
    queueShellShowsResult = false;
    phase = 'idle';
    emitClientDiagTrace('QUEUE_LOBBY_GUARD_STALE_RELEASED', {
      overlayQueueLength,
      ownerQueueLen,
      ownerPendingLen,
      resultOverlayMounted: resultOverlayMounted === true,
      directOverboardMounted: directOverboardMounted === true,
      previousQueueLobbyGuardActive,
      nextQueueLobbyGuardActive: false,
      reason: 'empty-overlay-empty-owner-release-stale-guard',
    });
  } else if (
    shouldReleaseStaleFromQueueResult({
      overlayQueueLength,
      ownerQueueLen,
      ownerPendingLen,
      fromQueueResult,
      visualQueueDimSessionLive,
    })
  ) {
    const guardFromQueueResultBefore = fromQueueResult;
    fromQueueResult = false;
    phase = resolveQueueLobbyPhase({
      queueLen,
      queueShellShowsResult,
      fromQueueResult: false,
      displayResultSourcePicked: patch.displayResultSourcePicked,
    });
    const queueLobbyGuardActiveAfter = shouldBlockLobbyForActiveQueue({
      queueLen,
      pendingLen,
      fromQueueResult: false,
      queueShellShowsResult,
      phase,
    });
    emitClientDiagTrace('QUEUE_LOBBY_GUARD_FROM_QUEUE_RESULT_RELEASED', {
      overlayQueueLength,
      ownerQueueLen,
      ownerPendingLen,
      guardFromQueueResultBefore,
      guardFromQueueResultAfter: false,
      queueLobbyGuardActiveBefore: previousQueueLobbyGuardActive,
      queueLobbyGuardActiveAfter,
      resultOverlayMounted: resultOverlayMounted === true,
      visualQueueDimSessionLive: visualQueueDimSessionLive === true,
      reason: 'empty-owner-release-stale-from-queue-result',
    });
  }

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
    overlayQueueLength,
    ownerQueueLen,
    ownerPendingLen,
    queueLobbyGuardActive,
    guardSnapshot,
    resultOverlayMounted:
      resultOverlayMounted === undefined ? null : resultOverlayMounted,
    directOverboardMounted:
      directOverboardMounted === undefined ? null : directOverboardMounted,
    visualQueueDimSessionLive:
      visualQueueDimSessionLive === undefined
        ? null
        : visualQueueDimSessionLive,
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
