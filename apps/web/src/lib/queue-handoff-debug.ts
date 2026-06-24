'use client';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

const QUEUE_HANDOFF_DRAIN_MARKERS = [
  'active-timer-close',
  'active-timer-card-close',
  'post-timer-handoff',
  'reply-queue-resume',
  'timer-close-showNext',
  'releaseNotificationQueueAfterReplyParentActive',
  'stale-active-clear',
  'stale-active-clear-drain',
  'status-cta',
  'overboard-status-direct',
] as const;

export function isNotificationQueueHandoffDrainSource(source: string): boolean {
  return QUEUE_HANDOFF_DRAIN_MARKERS.some((marker) => source.includes(marker));
}

export function logQueueHandoffFetchResult(data: {
  source: string;
  phase: string;
  queueLen: number;
  pendingLen?: number;
  headId?: string | null;
  toEnqueueLen?: number;
}): void {
  emit('[QUEUE HANDOFF FETCH RESULT]', data);
}

export function logQueueHandoffOpenNext(data: {
  source: string;
  phase: string;
  queueLen: number;
  pendingLen?: number;
  headId?: string | null;
}): void {
  emit('[QUEUE HANDOFF OPEN NEXT]', data);
}

export function logQueueHandoffEmptyLobby(data: {
  source: string;
  phase: string;
  queueLen: number;
  pendingLen?: number;
  headId?: string | null;
}): void {
  emit('[QUEUE HANDOFF EMPTY -> LOBBY]', data);
}
