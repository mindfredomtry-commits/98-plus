import { parseStartParam, readStartParamFromInitData } from '@98plus/shared';
import { readStartParamRawFromLocation } from '@/lib/deep-link-boot-debug';
import { pushResultOpenTrace } from '@/lib/result-open-trace';

/** Blocks auto pending result/status overlays during priority deep-link flows. */
export type NotificationQueueLockReason =
  | 'deep-link-active-ban'
  | 'repeat-ban-flow'
  | 'send-flow'
  | 'low-energy-gate';

type LockState = {
  reason: NotificationQueueLockReason;
  banId?: string | null;
};

let lockState: LockState | null = null;

/** Incoming ban id for which local "Перебор" click may bypass priority lock. */
let localOverboardBypassBanId: string | null = null;

/** Brief window: unlock flush may show deferred pending results. */
let explicitResultUnlockActive = false;

const LOCAL_OVERBOARD_SOURCES = new Set([
  'local-overboard-click',
  'forceOpenOverboardResult',
  'direct-overboard-result',
  'DirectOverboardResultLayer',
  'syncDisplayFromQueue-direct',
]);

type ResultOpenTraceContext = {
  getActiveOverlayKind: () => string | null;
  getActiveBanDeepLinkId: () => string | null;
};

let traceContext: ResultOpenTraceContext | null = null;

export function registerResultOpenTraceContext(
  ctx: ResultOpenTraceContext | null,
): void {
  traceContext = ctx;
}

export function armLocalOverboardBypass(banId: string): void {
  localOverboardBypassBanId = banId;
}

export function clearLocalOverboardBypass(): void {
  localOverboardBypassBanId = null;
}

export function getLocalOverboardBypassBanId(): string | null {
  return localOverboardBypassBanId;
}

export function isLocalOverboardBypassForBan(
  banId: string | null | undefined,
): boolean {
  return !!banId && localOverboardBypassBanId === banId;
}

export function isNotificationQueueLocked(): boolean {
  return lockState != null;
}

export function isOverlayPriorityLocked(): boolean {
  return lockState != null;
}

export function getNotificationQueueLockReason(): NotificationQueueLockReason | null {
  return lockState?.reason ?? null;
}

export function lockNotificationQueue(
  reason: NotificationQueueLockReason,
  banId?: string | null,
): void {
  const prev = lockState?.reason ?? null;
  lockState = { reason, banId: banId ?? null };
  logOverlayPriority('queue-locked', {
    reason,
    lockReason: reason,
    banId: banId ?? null,
  });
}

export function unlockNotificationQueue(unlockReason: string): void {
  if (!lockState) return;
  const prev = lockState.reason;
  lockState = null;
  logOverlayPriority('queue-unlocked', { reason: unlockReason, prevLock: prev });
}

export function runWithExplicitResultUnlock<T>(fn: () => T): T {
  explicitResultUnlockActive = true;
  try {
    return fn();
  } finally {
    explicitResultUnlockActive = false;
  }
}

export function readPriorityStartParamRaw(): string | null {
  if (typeof window === 'undefined') return null;
  const fromUrl = readStartParamRawFromLocation();
  if (fromUrl) return fromUrl;
  const tg = window.Telegram?.WebApp;
  const fromUnsafe = tg?.initDataUnsafe?.start_param?.trim();
  if (fromUnsafe) return fromUnsafe;
  const fromInitData = readStartParamFromInitData(tg?.initData)?.trim();
  if (fromInitData) return fromInitData;
  return null;
}

/** Lock synchronously from Telegram start_param (URL or initData). */
export function tryLockFromStartParam(source: string): boolean {
  const action = parseStartParam(readPriorityStartParamRaw() ?? undefined);
  if (!action) return false;
  if (action.type === 'active') {
    lockNotificationQueue('deep-link-active-ban', action.banId);
    logOverlayPriority('deep-link-active-start', {
      banId: action.banId,
      source,
    });
    return true;
  }
  if (action.type === 'repeat') {
    lockNotificationQueue('repeat-ban-flow', action.banId);
    logOverlayPriority('repeat-flow-start', { banId: action.banId, source });
    return true;
  }
  return false;
}

export type ResultOpenAttemptSource =
  | 'local-overboard-click'
  | 'receiveResult'
  | 'openBanResult'
  | 'pollPendingResultOnce'
  | 'reloadPending'
  | 'ingestQueuedOverlay'
  | 'syncDisplayFromQueue'
  | 'syncDisplayFromQueue-direct'
  | 'forceOpenOverboardResult'
  | 'DirectOverboardResultLayer'
  | 'legacy-queue-commit'
  | 'useSocialBoot-explicit'
  | 'ws-check-completed'
  | 'submitCheckAnswer-http';

export function logResultOpenAttempt(
  source: ResultOpenAttemptSource | string,
  data: {
    banId?: string | null;
    resultId?: string | null;
    mode?: string | null;
    allowed: boolean;
    blockReason?: string | null;
    bypassPriorityLock?: boolean;
    extra?: Record<string, unknown>;
  },
): void {
  const banId = data.banId ?? data.resultId ?? null;
  const lockReason = getNotificationQueueLockReason();
  const bypassPriorityLock =
    data.bypassPriorityLock ??
    (isLocalOverboardBypassForBan(banId) &&
      LOCAL_OVERBOARD_SOURCES.has(String(source)));
  const isLocalUserAction =
    bypassPriorityLock === true ||
    (isLocalOverboardBypassForBan(banId) &&
      LOCAL_OVERBOARD_SOURCES.has(String(source)));

  const activeOverlayKind = traceContext?.getActiveOverlayKind() ?? null;
  const activeBanDeepLinkId = traceContext?.getActiveBanDeepLinkId() ?? null;
  const row = {
    source,
    banId,
    resultId: data.resultId ?? banId,
    lockReason,
    isLocalUserAction,
    bypassPriorityLock,
    activeOverlayKind,
    activeBanDeepLinkId,
    notificationQueueLockReason: lockReason,
    isLocked: isNotificationQueueLocked(),
    allowed: data.allowed,
    mode: data.mode ?? null,
    blockReason: data.blockReason ?? null,
    localOverboardBypassBanId: getLocalOverboardBypassBanId(),
    explicitResultUnlockActive,
    ...data.extra,
  };
  console.log('[RESULT OPEN ATTEMPT]', row);
  const phase =
    typeof data.extra?.phase === 'string' ? data.extra.phase : 'attempt';
  pushResultOpenTrace({
    ts: Date.now(),
    source: String(source),
    phase,
    banId,
    resultId: data.resultId ?? banId,
    lockReason,
    bypassPriorityLock: bypassPriorityLock === true,
    allowed: data.allowed,
    activeOverlayKind,
    activeBanDeepLinkId,
    blockReason: data.blockReason ?? null,
    isLocked: isNotificationQueueLocked(),
    isLocalUserAction,
    mode: data.mode ?? null,
    reason: data.blockReason ?? null,
    extra: data.extra,
  });
}

/** Full guard diagnosis when allowed=false — copy from Telegram WebView console. */
export function logResultOpenDenied(
  source: string,
  banId: string | null,
  block: ReturnType<typeof shouldBlockResultOpen>,
  extra?: Record<string, unknown>,
): void {
  logResultOpenAttempt(source, {
    resultId: banId,
    allowed: false,
    blockReason: block.reason,
    bypassPriorityLock: block.bypassPriorityLock,
    extra: {
      denied: true,
      localOverboardBypassBanId: getLocalOverboardBypassBanId(),
      explicitResultUnlockActive,
      ...extra,
    },
  });
}

export function shouldBlockResultOpen(opts?: {
  source?: string;
  explicitUserUnlock?: boolean;
  overboardInFlightBanId?: string | null;
  resultBanId?: string | null;
  bypassPriorityLock?: boolean;
}): {
  blocked: boolean;
  reason: string | null;
  bypassPriorityLock: boolean;
} {
  const lockReason = getNotificationQueueLockReason();

  if (!isNotificationQueueLocked()) {
    return { blocked: false, reason: null, bypassPriorityLock: false };
  }

  const bypassPriorityLock =
    opts?.bypassPriorityLock === true ||
    opts?.explicitUserUnlock === true ||
    explicitResultUnlockActive ||
    (opts?.resultBanId != null &&
      isLocalOverboardBypassForBan(opts.resultBanId)) ||
    (opts?.overboardInFlightBanId != null &&
      opts?.resultBanId != null &&
      opts.overboardInFlightBanId === opts.resultBanId);

  if (bypassPriorityLock) {
    return { blocked: false, reason: null, bypassPriorityLock: true };
  }

  return {
    blocked: true,
    reason: lockReason,
    bypassPriorityLock: false,
  };
}

export function logOverlayPriority(
  event:
    | 'deep-link-active-start'
    | 'queue-locked'
    | 'pending-result-blocked'
    | 'active-ban-opened'
    | 'repeat-flow-start'
    | 'send-success-unlock'
    | 'low-energy-keep-locked'
    | 'explicit-bans-open-unlock'
    | 'queue-unlocked'
    | 'pending-result-shown',
  data: Record<string, unknown>,
): void {
  console.log(`[OVERLAY PRIORITY] ${event}`, data);
}

/** Synchronous lock before React effects — blocks reloadPending result flash. */
if (typeof window !== 'undefined') {
  tryLockFromStartParam('module-init');
}
