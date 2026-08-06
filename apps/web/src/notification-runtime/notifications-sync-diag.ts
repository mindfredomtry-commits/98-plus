/**
 * Stage 8 Phase 9E/9G — production-safe Sync / Close→reopen diagnostics.
 *
 * Enable in browser console:
 *   window.__NOTIFICATIONS_SYNC_DIAG__ = true
 *
 * Never logs tokens or Authorization headers.
 */
export type NotificationsSyncDiagStage =
  | 'RUNTIME_STORE_CREATED'
  | 'SYNC_STARTED'
  | 'TOKEN_RESOLVED'
  | 'HTTP_REQUEST_STARTED'
  | 'HTTP_URL'
  | 'HTTP_STATUS'
  | 'HTTP_RAW_RESPONSE'
  | 'CONTRACT_PARSE'
  | 'MAPPER_COMMAND'
  | 'REDUCER_APPLY'
  | 'RECONCILE_OUTCOME'
  | 'RUNTIME_STATE'
  | 'AVAILABILITY'
  | 'OPEN_INTENT'
  | 'ACTIVATION_RESULT'
  | 'OWNER_DECISION'
  | 'RELEASE'
  | 'WS_DELTA'
  | 'REQUEST_FULL_SYNC'
  | 'SYNC_FAILED'
  | 'CLOSE_INTENT'
  /** Phase 9G Close → second OPEN breadcrumbs (exact values). */
  | 'CLOSE_BUTTON_PRESSED'
  | 'CLOSE_SURFACE_EVENT'
  | 'CLOSE_RUNTIME_DISPATCH_RESULT'
  | 'CLOSE_EFFECTS'
  | 'SESSION_COMPLETE_SINK'
  | 'RELEASE_EVENT_DISPATCHED'
  | 'RELEASE_EVENT_RESULT'
  | 'OWNER_AFTER_RELEASE'
  | 'AVAILABILITY_AFTER_RELEASE'
  | 'SECOND_NOTIFICATIONS_BUTTON_PRESSED'
  | 'SECOND_OPEN_EVENT_DISPATCHED'
  | 'SECOND_OPEN_EVENT_RESULT'
  | 'OWNER_AFTER_SECOND_OPEN'
  | 'ACTIVATE_EVENT_DISPATCHED'
  | 'ACTIVATE_EVENT_RESULT'
  | 'RUNTIME_AFTER_ACTIVATION'
  | 'CONTROLLER_SNAPSHOT_AFTER_ACTIVATION'
  | 'PRESENTER_VIEW_AFTER_ACTIVATION'
  | 'SURFACE_MOUNT_OR_UPDATE'
  /** Phase 9H rebuilt open path. */
  | 'LOBBY_CTA_CLICK'
  | 'COORDINATOR_OPEN_BEGIN'
  | 'COORDINATOR_CAPABILITY'
  | 'RUNTIME_SESSION_BEGIN'
  | 'RUNTIME_ACTIVATE_BEGIN'
  | 'RUNTIME_ACTIVATE_RESULT'
  | 'PRESENTER_SNAPSHOT'
  | 'COORDINATOR_OWNER_COMMIT'
  | 'APPLICATION_SURFACE_BRANCH'
  | 'NOTIFICATION_SURFACE_MOUNT'
  | 'RUNTIME_ITEM_DEACTIVATED'
  | 'RUNTIME_ITEM_REINSERTED'
  | 'RUNTIME_SESSION_COMPLETE'
  | 'COORDINATOR_RELEASE'
  | 'COORDINATOR_OWNER_COMMIT_CREATE_BAN'
  | 'OWNER_PRESENTATION_INVARIANT_VIOLATION'
  | 'STALE_SESSION_COMPLETE_IGNORED';

export type NotificationsSyncDiagEntry = {
  seq: number;
  ts: number;
  correlationId: string;
  stage: NotificationsSyncDiagStage;
  detail?: Record<string, unknown>;
};

type SyncDiagGlobal = typeof globalThis & {
  __NOTIFICATIONS_SYNC_DIAG__?: boolean;
  __notificationsSyncDiagLedger?: NotificationsSyncDiagEntry[];
  __notificationsSyncDiagSeq?: number;
};

function diagGlobal(): SyncDiagGlobal {
  return globalThis as SyncDiagGlobal;
}

export function isNotificationsSyncDiagEnabled(): boolean {
  const g = diagGlobal();
  if (g.__NOTIFICATIONS_SYNC_DIAG__ === true) return true;
  if (
    typeof process !== 'undefined' &&
    process.env?.NOTIFICATIONS_SYNC_DIAG === '1'
  ) {
    return true;
  }
  return false;
}

export function resetNotificationsSyncDiag(): void {
  const g = diagGlobal();
  g.__notificationsSyncDiagLedger = [];
  g.__notificationsSyncDiagSeq = 0;
}

export function getNotificationsSyncDiagLedger(): readonly NotificationsSyncDiagEntry[] {
  return diagGlobal().__notificationsSyncDiagLedger ?? [];
}

let correlationSeq = 0;

export function nextNotificationsSyncCorrelationId(prefix = 'sync'): string {
  correlationSeq += 1;
  return `${prefix}:${correlationSeq}:${Date.now().toString(36)}`;
}

/** Strip query values that might contain secrets; keep path + afterRevision key only. */
export function redactSyncUrl(url: string): string {
  try {
    const u = new URL(url);
    const after = u.searchParams.get('afterRevision');
    u.search = '';
    if (after != null) {
      u.searchParams.set(
        'afterRevision',
        /^\d+$/.test(after) ? after : '[redacted]',
      );
    }
    return u.toString();
  } catch {
    return url.split('?')[0] ?? url;
  }
}

export function logNotificationsSyncDiag(
  correlationId: string,
  stage: NotificationsSyncDiagStage,
  detail?: Record<string, unknown>,
): void {
  if (!isNotificationsSyncDiagEnabled()) return;
  const g = diagGlobal();
  if (!g.__notificationsSyncDiagLedger) g.__notificationsSyncDiagLedger = [];
  g.__notificationsSyncDiagSeq = (g.__notificationsSyncDiagSeq ?? 0) + 1;
  const entry: NotificationsSyncDiagEntry = {
    seq: g.__notificationsSyncDiagSeq,
    ts: Date.now(),
    correlationId,
    stage,
    detail,
  };
  g.__notificationsSyncDiagLedger.push(entry);
  // eslint-disable-next-line no-console
  console.log('[notifications-sync-diag]', entry);
}
