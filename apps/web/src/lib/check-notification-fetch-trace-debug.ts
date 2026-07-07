'use client';

export type CheckNotificationTraceSource =
  | 'bootstrap'
  | 'polling'
  | 'success-drain'
  | 'lobby-indicator-prime'
  | string;

export type CheckNotificationDiagSnapshot = {
  source: CheckNotificationTraceSource;
  telegramUserId: string | null;
  incomingCount: number;
  checkCount: number;
  resultCount: number;
  hasCheck: boolean;
  hasPendingNotificationChain: boolean;
  ownerQueueLen: number;
  ownerPendingLen: number;
  legacyQueueLen: number;
  legacyPendingLen: number;
  indicatorVisible: boolean;
  skipReason: string | null;
  endpoint: string | null;
};

function emit(event: string, data: Record<string, unknown>): void {
  const payload = { timestamp: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function normalizeCheckNotificationTraceSource(
  source: string,
): CheckNotificationTraceSource {
  if (source.includes('lobby-indicator-prime')) {
    return 'lobby-indicator-prime';
  }
  if (
    source.includes('success-exit') ||
    source.includes('success-drain') ||
    source.includes('releaseStartupInteractions')
  ) {
    return 'success-drain';
  }
  if (
    source.includes('poll') ||
    source.includes('receiveCheckBan:poll') ||
    source.includes('check-poll')
  ) {
    return 'polling';
  }
  if (
    source.includes('bootstrap') ||
    source.includes('auth-ready') ||
    source.includes('reloadPending') ||
    source.includes('apply-session') ||
    source.includes('session')
  ) {
    return 'bootstrap';
  }
  return source;
}

export function logCheckNotificationFetchTrace(
  data: CheckNotificationDiagSnapshot,
): void {
  emit('CHECK_NOTIFICATION_FETCH_TRACE', data);
}

export function logLobbyIndicatorCheckSourceTrace(
  data: CheckNotificationDiagSnapshot & {
    caller?: string | null;
    checkBanId?: string | null;
    enqueued?: boolean | null;
  },
): void {
  emit('LOBBY_INDICATOR_CHECK_SOURCE_TRACE', data);
}

export function logPendingCheckEnqueueTrace(
  data: CheckNotificationDiagSnapshot & {
    checkBanId?: string | null;
    enqueued?: boolean;
    enqueueTarget?: 'pending' | 'queue' | 'deferred' | null;
  },
): void {
  emit('PENDING_CHECK_ENQUEUE_TRACE', data);
}
