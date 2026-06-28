'use client';

import type { NotificationOverlayOwnerState } from '@/lib/notification-overlay-owner';
import { resolveOwnerHeadBanId } from '@/lib/notification-overlay-owner';
import { isPhase12DiagEnabled } from '@/lib/notification-overlay-owner-phase12-smoke-env';

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
  if (!ownerDirectWriteDetectEnabled()) return;
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value != null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !(value instanceof Set) &&
    !(value instanceof Map) &&
    !(value instanceof Date)
  );
}

function wrapMutableValue<T>(
  value: T,
  readTrackedSnapshot: () => OwnerTrackedFieldSnapshot,
  context: OwnerWriteDetectContext,
  path: string,
): T {
  if (!ownerDirectWriteDetectEnabled()) return value;
  if (value == null || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return new Proxy(value, {
      set(target, prop, newValue, receiver) {
        const before = readTrackedSnapshot();
        const result = Reflect.set(target, prop, newValue, receiver);
        const after = readTrackedSnapshot();
        logTrackedSnapshotDiff({
          previous: before,
          next: after,
          file: context.file,
          function: `${context.function}:${path}.${String(prop)}`,
          writePath: context.writePath,
          eventType: context.eventType,
        });
        return result;
      },
    }) as T;
  }

  if (!isPlainObject(value)) return value;

  return new Proxy(value, {
    set(target, prop, newValue, receiver) {
      const before = readTrackedSnapshot();
      const result = Reflect.set(target, prop, newValue, receiver);
      const after = readTrackedSnapshot();
      logTrackedSnapshotDiff({
        previous: before,
        next: after,
        file: context.file,
        function: `${context.function}:${path}.${String(prop)}`,
        writePath: context.writePath,
        eventType: context.eventType,
      });
      return result;
    },
  }) as T;
}

const OWNER_STATE_RAW = Symbol('ownerStateRaw');

export type OwnerStateWriteDetectHandle = {
  wrapped: NotificationOverlayOwnerState;
  unwrap: () => NotificationOverlayOwnerState;
  readTrackedSnapshot: () => OwnerTrackedFieldSnapshot;
};

export function attachOwnerStateWriteDetect(
  state: NotificationOverlayOwnerState,
  context: OwnerWriteDetectContext,
): OwnerStateWriteDetectHandle {
  if (!ownerDirectWriteDetectEnabled()) {
    return {
      wrapped: state,
      unwrap: () => state,
      readTrackedSnapshot: () => readOwnerTrackedWriteFields(state),
    };
  }

  const rawState = state;
  let trackedSnapshot = readOwnerTrackedWriteFields(rawState);

  const readTrackedSnapshot = () => readOwnerTrackedWriteFields(rawState);

  const wrapped = new Proxy(rawState, {
    set(target, prop, newValue, receiver) {
      const propName = String(prop);
      const before = readTrackedSnapshot();
      const result = Reflect.set(target, prop, newValue, receiver);
      const after = readTrackedSnapshot();
      logTrackedSnapshotDiff({
        previous: before,
        next: after,
        file: context.file,
        function: `${context.function}:${propName}`,
        writePath: context.writePath,
        eventType: context.eventType,
      });
      trackedSnapshot = after;
      return result;
    },
    get(target, prop, receiver) {
      if (prop === OWNER_STATE_RAW) return target;
      const value = Reflect.get(target, prop, receiver);
      if (prop === 'active' || prop === 'display' || prop === 'queue') {
        return wrapMutableValue(
          value,
          readTrackedSnapshot,
          context,
          String(prop),
        );
      }
      return value;
    },
  });

  return {
    wrapped,
    unwrap: () => rawState,
    readTrackedSnapshot: () => trackedSnapshot,
  };
}

export function logOwnerReducerTrackedFieldAssignments(args: {
  previous: NotificationOverlayOwnerState;
  next: NotificationOverlayOwnerState;
  function: string;
  eventType: string;
}): void {
  if (!ownerDirectWriteDetectEnabled()) return;
  logTrackedSnapshotDiff({
    previous: readOwnerTrackedWriteFields(args.previous),
    next: readOwnerTrackedWriteFields(args.next),
    file: 'notification-overlay-owner.ts',
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
  if (!ownerDirectWriteDetectEnabled()) return;
  logTrackedSnapshotDiff({
    previous: readOwnerTrackedWriteFields(args.previousState),
    next: readOwnerTrackedWriteFields(args.nextState),
    file: args.file,
    function: args.function,
    writePath: 'reducer-draft',
    eventType: args.eventType,
  });
}
