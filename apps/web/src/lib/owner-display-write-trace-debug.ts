'use client';

import type { NotificationOverlayOwnerState } from '@/notification-owner/notification-owner-pin-state';
import { resolveOwnerHeadBanId } from '@/notification-owner/notification-owner-pin-state';
import { overlayQueueKey } from '@/lib/overlay-queue';
import { isPhase12DiagEnabled } from '@/lib/phase12-diag-env-gate';
import {
  getOwnerDisplayWriteTraceContext,
  patchOwnerDisplayWriteTraceContext,
} from '@/lib/owner-display-write-trace-context';
import { logPhase12TraceReached } from '@/lib/phase12-diag-probe-debug';

export type OwnerDisplayWriteTraceSnapshot = {
  activeKind: string | null;
  activeBanId: string | null;
  displayResultBanId: string | null;
  displayIncomingBanId: string | null;
  displayCheckBanId: string | null;
  queueHeadKind: string | null;
  queueHeadBanId: string | null;
  queueLen: number;
  queueKeys: string;
  pendingLen: number;
  pendingKeys: string;
  directResultOverlayActive: boolean;
};

export function buildOwnerDisplayWriteTraceSnapshot(
  state: NotificationOverlayOwnerState,
): OwnerDisplayWriteTraceSnapshot {
  const head = resolveOwnerHeadBanId(state.queue);
  return {
    activeKind: state.active.kind,
    activeBanId: state.active.banId,
    displayResultBanId: state.display.result?.id ?? null,
    displayIncomingBanId: state.display.incomingBan?.id ?? null,
    displayCheckBanId: state.display.checkBan?.id ?? null,
    queueHeadKind: head.kind,
    queueHeadBanId: head.banId,
    queueLen: state.queue.length,
    queueKeys: state.queue.map(overlayQueueKey).join('|'),
    pendingLen: state.pending.length,
    pendingKeys: state.pending.map(overlayQueueKey).join('|'),
    directResultOverlayActive: state.display.directResultOverlayActive,
  };
}

function diffOwnerDisplayWriteTraceSnapshots(
  previous: OwnerDisplayWriteTraceSnapshot,
  next: OwnerDisplayWriteTraceSnapshot,
): string[] {
  const changed: string[] = [];
  (
    Object.keys(previous) as Array<keyof OwnerDisplayWriteTraceSnapshot>
  ).forEach((key) => {
    if (previous[key] !== next[key]) {
      changed.push(`${String(key)}: ${String(previous[key])} -> ${String(next[key])}`);
    }
  });
  return changed;
}

function captureOwnerDisplayWriteCallerStack(minLines = 8): string[] {
  const stack = new Error().stack ?? '';
  return stack
    .split('\n')
    .slice(2, 2 + minLines)
    .map((line) => line.trim())
    .filter(Boolean);
}

function ownerDisplayWriteTraceEnabled(): boolean {
  return typeof window !== 'undefined' && isPhase12DiagEnabled();
}

export function logOwnerDisplayWriteTrace(args: {
  previous: OwnerDisplayWriteTraceSnapshot;
  next: OwnerDisplayWriteTraceSnapshot;
  reason: string;
  source: string;
  eventType: string;
}): void {
  logPhase12TraceReached('OWNER DISPLAY WRITE TRACE', 'before-gate', {
    reason: args.reason,
    source: args.source,
    eventType: args.eventType,
  });
  const enabled = ownerDisplayWriteTraceEnabled();
  logPhase12TraceReached('OWNER DISPLAY WRITE TRACE', 'after-gate', {
    gatePassed: enabled,
    reason: args.reason,
    source: args.source,
    eventType: args.eventType,
  });
  if (!enabled) return;
  const changedFields = diffOwnerDisplayWriteTraceSnapshots(
    args.previous,
    args.next,
  );
  if (changedFields.length === 0) return;

  const ctx = getOwnerDisplayWriteTraceContext();
  patchOwnerDisplayWriteTraceContext({
    activeBanId: args.next.activeBanId,
    resultBanId: args.next.displayResultBanId,
  });

  const payload = {
    t: performance.now(),
    previous: args.previous,
    next: args.next,
    changedFields,
    reason: args.reason,
    source: args.source,
    eventType: args.eventType,
    callerStack: captureOwnerDisplayWriteCallerStack(8),
    clickedResultBanId: ctx.clickedResultBanId,
    currentResultBanId: ctx.resultBanId ?? args.next.displayResultBanId,
    currentActiveBanId: ctx.activeBanId ?? args.next.activeBanId,
  };
  console.log('[OWNER DISPLAY WRITE TRACE]', payload);
  window.__debug98log?.('[OWNER DISPLAY WRITE TRACE]', payload);
}

export function logGoToBansActiveMismatchPreSnapshot(
  ownerState: NotificationOverlayOwnerState,
  extra: Record<string, unknown> = {},
): void {
  logPhase12TraceReached('GO TO BANS ACTIVE MISMATCH PRE-SNAPSHOT', 'before-gate', {
    clickedResultBanId: extra.clickedResultBanId ?? null,
  });
  const enabled = ownerDisplayWriteTraceEnabled();
  logPhase12TraceReached('GO TO BANS ACTIVE MISMATCH PRE-SNAPSHOT', 'after-gate', {
    gatePassed: enabled,
    clickedResultBanId: extra.clickedResultBanId ?? null,
  });
  if (!enabled) return;
  const snap = buildOwnerDisplayWriteTraceSnapshot(ownerState);
  const ctx = getOwnerDisplayWriteTraceContext();
  const payload = {
    t: performance.now(),
    activeKind: snap.activeKind,
    activeBanId: snap.activeBanId,
    resultBanId: snap.displayResultBanId,
    queueHeadKind: snap.queueHeadKind,
    queueHeadBanId: snap.queueHeadBanId,
    queueLen: snap.queueLen,
    pendingLen: snap.pendingLen,
    directResultOverlayActive: snap.directResultOverlayActive,
    notificationSessionActive:
      extra.notificationSessionActive ?? ctx.notificationSessionActive,
    bansOverlayOpen: extra.bansOverlayOpen ?? ctx.bansOverlayOpen,
    targetTab: extra.targetTab ?? ctx.targetTab,
    clickedResultBanId: extra.clickedResultBanId ?? ctx.clickedResultBanId,
    queueKeys: snap.queueKeys,
    pendingKeys: snap.pendingKeys,
    displayIncomingBanId: snap.displayIncomingBanId,
    displayCheckBanId: snap.displayCheckBanId,
    ...extra,
  };
  console.log('[GO TO BANS ACTIVE MISMATCH PRE-SNAPSHOT]', payload);
  window.__debug98log?.('[GO TO BANS ACTIVE MISMATCH PRE-SNAPSHOT]', payload);
}
