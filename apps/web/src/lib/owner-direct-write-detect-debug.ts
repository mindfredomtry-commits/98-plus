'use client';

import type { NotificationOverlayOwnerState } from '@/notification-owner/notification-owner-pin-state';
import { resolveOwnerHeadBanId } from '@/notification-owner/notification-owner-pin-state';
import { isPhase12DiagEnabled } from '@/lib/phase12-diag-env-gate';
import { logPhase12TraceReached } from '@/lib/phase12-diag-probe-debug';

export type OwnerTrackedWriteField =
  | 'activeKind'
  | 'activeBanId'
  | 'displayResultBanId'
  | 'queueHeadBanId';

export type OwnerDirectWritePath =
  | 'shadow-state-in-place'
  | 'reducer-draft'
  | 'state-replace-bypass';

export type OwnerTrackedFieldSnapshot = Record<OwnerTrackedWriteField, string | null>;

const TRACKED_FIELD_KEYS: OwnerTrackedWriteField[] = [
  'activeKind',
  'activeBanId',
  'displayResultBanId',
  'queueHeadBanId',
];

export function readOwnerTrackedWriteFields(
  state: NotificationOverlayOwnerState,
): OwnerTrackedFieldSnapshot {
  const head = resolveOwnerHeadBanId(state.queue);
  return {
    activeKind: state.active.kind,
    activeBanId: state.active.banId,
    displayResultBanId: state.display.result?.id ?? null,
    queueHeadBanId: head.banId,
  };
}

function captureOwnerDirectWriteCallerStack(minLines = 8): string[] {
  const stack = new Error().stack ?? '';
  return stack
    .split('\n')
    .slice(2, 2 + minLines)
    .map((line) => line.trim())
    .filter(Boolean);
}

function ownerDirectWriteDetectEnabled(): boolean {
  return typeof window !== 'undefined' && isPhase12DiagEnabled();
}

export function logOwnerDirectWriteDetected(args: {
  file: string;
  function: string;
  field: OwnerTrackedWriteField;
  oldValue: string | null;
  newValue: string | null;
  writePath: OwnerDirectWritePath;
  callerStack?: string[];
  eventType?: string;
}): void {
  logPhase12TraceReached('OWNER DIRECT WRITE DETECTED', 'before-gate', {
    field: args.field,
    writePath: args.writePath,
    function: args.function,
  });
  const enabled = ownerDirectWriteDetectEnabled();
  logPhase12TraceReached('OWNER DIRECT WRITE DETECTED', 'after-gate', {
    gatePassed: enabled,
    field: args.field,
    writePath: args.writePath,
    function: args.function,
  });
  if (!enabled) return;
  if (args.oldValue === args.newValue) return;

  const payload = {
    t: performance.now(),
    file: args.file,
    function: args.function,
    field: args.field,
    oldValue: args.oldValue,
    newValue: args.newValue,
    writePath: args.writePath,
    eventType: args.eventType ?? null,
    callerStack: args.callerStack ?? captureOwnerDirectWriteCallerStack(8),
  };
  console.log('[OWNER DIRECT WRITE DETECTED]', payload);
  window.__debug98log?.('[OWNER DIRECT WRITE DETECTED]', payload);
}

export function logOwnerStateReplaceBypass(args: {
  file: string;
  function: string;
  changedFields: string[];
  callerStack?: string[];
}): void {
  if (!ownerDirectWriteDetectEnabled()) return;
  if (args.changedFields.length === 0) return;

  const payload = {
    t: performance.now(),
    file: args.file,
    function: args.function,
    changedFields: args.changedFields,
    writePath: 'state-replace-bypass' as const,
    callerStack: args.callerStack ?? captureOwnerDirectWriteCallerStack(8),
  };
  console.log('[OWNER STATE REPLACE BYPASS]', payload);
  window.__debug98log?.('[OWNER STATE REPLACE BYPASS]', payload);
}

function diffTrackedFieldSnapshots(
  previous: OwnerTrackedFieldSnapshot,
  next: OwnerTrackedFieldSnapshot,
): Array<{ field: OwnerTrackedWriteField; oldValue: string | null; newValue: string | null }> {
  const changed: Array<{
    field: OwnerTrackedWriteField;
    oldValue: string | null;
    newValue: string | null;
  }> = [];
  for (const field of TRACKED_FIELD_KEYS) {
    if (previous[field] !== next[field]) {
      changed.push({
        field,
        oldValue: previous[field],
        newValue: next[field],
      });
    }
  }
  return changed;
}

function logTrackedSnapshotDiff(args: {
  previous: OwnerTrackedFieldSnapshot;
  next: OwnerTrackedFieldSnapshot;
  file: string;
  function: string;
  writePath: OwnerDirectWritePath;
  eventType?: string;
}): void {
  for (const change of diffTrackedFieldSnapshots(args.previous, args.next)) {
    logOwnerDirectWriteDetected({
      file: args.file,
      function: args.function,
      field: change.field,
      oldValue: change.oldValue,
      newValue: change.newValue,
      writePath: args.writePath,
      eventType: args.eventType,
    });
  }
}

type OwnerWriteDetectContext = {
  file: string;
  function: string;
  writePath: OwnerDirectWritePath;
  eventType?: string;
};

export type OwnerStateWriteDetectHandle = {
  wrapped: NotificationOverlayOwnerState;
  unwrap: () => NotificationOverlayOwnerState;
  readTrackedSnapshot: () => OwnerTrackedFieldSnapshot;
};

/** Plain-state handle only — Proxy wrappers break SSR/client hydration parity. */
export function attachOwnerStateWriteDetect(
  state: NotificationOverlayOwnerState,
  _context: OwnerWriteDetectContext,
): OwnerStateWriteDetectHandle {
  return {
    wrapped: state,
    unwrap: () => state,
    readTrackedSnapshot: () => readOwnerTrackedWriteFields(state),
  };
}

export function logOwnerReducerTrackedFieldAssignments(args: {
  previous: NotificationOverlayOwnerState;
  next: NotificationOverlayOwnerState;
  function: string;
  eventType: string;
}): void {
  logPhase12TraceReached('OWNER DIRECT WRITE DETECTED', 'before-gate', {
    upstream: 'logOwnerReducerTrackedFieldAssignments',
    eventType: args.eventType,
  });
  const enabled = ownerDirectWriteDetectEnabled();
  logPhase12TraceReached('OWNER DIRECT WRITE DETECTED', 'after-gate', {
    gatePassed: enabled,
    upstream: 'logOwnerReducerTrackedFieldAssignments',
    eventType: args.eventType,
  });
  if (!enabled) return;
  logTrackedSnapshotDiff({
    previous: readOwnerTrackedWriteFields(args.previous),
    next: readOwnerTrackedWriteFields(args.next),
    file: 'notification-owner-pin-state.ts',
    function: args.function,
    writePath: 'reducer-draft',
    eventType: args.eventType,
  });
}

export function logOwnerFunctionTrackedFieldWrite(args: {
  previousState: NotificationOverlayOwnerState;
  nextState: NotificationOverlayOwnerState;
  file: string;
  function: string;
  eventType?: string;
}): void {
  logPhase12TraceReached('OWNER DIRECT WRITE DETECTED', 'before-gate', {
    upstream: 'logOwnerFunctionTrackedFieldWrite',
    function: args.function,
    eventType: args.eventType ?? null,
  });
  const enabled = ownerDirectWriteDetectEnabled();
  logPhase12TraceReached('OWNER DIRECT WRITE DETECTED', 'after-gate', {
    gatePassed: enabled,
    upstream: 'logOwnerFunctionTrackedFieldWrite',
    function: args.function,
    eventType: args.eventType ?? null,
  });
  if (!enabled) return;
  logTrackedSnapshotDiff({
    previous: readOwnerTrackedWriteFields(args.previousState),
    next: readOwnerTrackedWriteFields(args.nextState),
    file: args.file,
    function: args.function,
    writePath: 'reducer-draft',
    eventType: args.eventType,
  });
}
