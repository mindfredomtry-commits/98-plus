'use client';

import type {
  SuccessDrainEmptyShellHoldInput,
  SuccessDrainEmptyShellHoldReleaseReason,
} from './success-drain-empty-shell-hold';

/** Edge-only diagnostics — never emitted per render frame. */
export const SUCCESS_EMPTY_SHELL_HOLD_ENTER = 'SUCCESS_EMPTY_SHELL_HOLD_ENTER';
export const SUCCESS_EMPTY_SHELL_HOLD_RELEASE =
  'SUCCESS_EMPTY_SHELL_HOLD_RELEASE';

export type SuccessDrainEmptyShellHoldTraceFields = {
  releaseReason: SuccessDrainEmptyShellHoldReleaseReason;
  runtimeLifecycle: string | null;
  runtimeDisplayKind: string | null;
  runtimeQueueLength: number;
  runtimePendingCount: number;
  notificationPresentationClaimed: boolean;
  drainPrefetchInFlight: boolean;
  heldMs: number | null;
};

function emit(event: string, data: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function logSuccessEmptyShellHoldEnter(
  fields: SuccessDrainEmptyShellHoldTraceFields,
): void {
  emit(SUCCESS_EMPTY_SHELL_HOLD_ENTER, fields);
}

export function logSuccessEmptyShellHoldRelease(
  fields: SuccessDrainEmptyShellHoldTraceFields,
): void {
  emit(SUCCESS_EMPTY_SHELL_HOLD_RELEASE, fields);
}

export function buildSuccessEmptyShellHoldTraceFields(
  input: SuccessDrainEmptyShellHoldInput,
  releaseReason: SuccessDrainEmptyShellHoldReleaseReason,
  heldMs: number | null,
): SuccessDrainEmptyShellHoldTraceFields {
  return {
    releaseReason,
    runtimeLifecycle: input.runtimeLifecycle ?? null,
    runtimeDisplayKind: input.runtimeDisplayKind,
    runtimeQueueLength: input.runtimeQueueLength,
    runtimePendingCount: input.runtimePendingCount,
    notificationPresentationClaimed: input.notificationPresentationClaimed,
    drainPrefetchInFlight: input.drainPrefetchInFlight,
    heldMs,
  };
}
