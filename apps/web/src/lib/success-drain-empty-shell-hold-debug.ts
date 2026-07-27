'use client';

import type {
  SuccessPresentationHandoffHoldInput,
  SuccessPresentationHandoffReleaseReason,
} from './success-drain-empty-shell-hold';

/** Edge-only diagnostics — never emitted per render frame. */
export const SUCCESS_PRESENTATION_HANDOFF_ARMED =
  'SUCCESS_PRESENTATION_HANDOFF_ARMED';
export const SUCCESS_PRESENTATION_HANDOFF_RELEASED =
  'SUCCESS_PRESENTATION_HANDOFF_RELEASED';

/** @deprecated prefer SUCCESS_PRESENTATION_HANDOFF_* */
export const SUCCESS_EMPTY_SHELL_HOLD_ENTER = SUCCESS_PRESENTATION_HANDOFF_ARMED;
/** @deprecated prefer SUCCESS_PRESENTATION_HANDOFF_* */
export const SUCCESS_EMPTY_SHELL_HOLD_RELEASE =
  SUCCESS_PRESENTATION_HANDOFF_RELEASED;

export type SuccessPresentationHandoffTraceFields = {
  reason: SuccessPresentationHandoffReleaseReason;
  successVisible: boolean;
  runtimeLifecycle: string | null;
  runtimeDisplayKind: string | null;
  runtimeQueueLength: number;
  notificationScreenClaimed: boolean;
  nextItemMaterialized: boolean;
  chainExplicitlyEmpty: boolean;
  elapsedMs: number | null;
};

/** @deprecated */
export type SuccessDrainEmptyShellHoldTraceFields =
  SuccessPresentationHandoffTraceFields & {
    releaseReason?: SuccessPresentationHandoffReleaseReason;
    runtimePendingCount?: number;
    drainPrefetchInFlight?: boolean;
    heldMs?: number | null;
  };

function emit(event: string, data: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function logSuccessPresentationHandoffArmed(
  fields: SuccessPresentationHandoffTraceFields,
): void {
  emit(SUCCESS_PRESENTATION_HANDOFF_ARMED, fields);
}

export function logSuccessPresentationHandoffReleased(
  fields: SuccessPresentationHandoffTraceFields,
): void {
  emit(SUCCESS_PRESENTATION_HANDOFF_RELEASED, fields);
}

/** @deprecated */
export function logSuccessEmptyShellHoldEnter(
  fields: SuccessDrainEmptyShellHoldTraceFields,
): void {
  logSuccessPresentationHandoffArmed(normalizeTrace(fields));
}

/** @deprecated */
export function logSuccessEmptyShellHoldRelease(
  fields: SuccessDrainEmptyShellHoldTraceFields,
): void {
  logSuccessPresentationHandoffReleased(normalizeTrace(fields));
}

function normalizeTrace(
  fields: SuccessDrainEmptyShellHoldTraceFields,
): SuccessPresentationHandoffTraceFields {
  return {
    reason: fields.reason ?? fields.releaseReason ?? 'holding-armed-awaiting-terminal',
    successVisible: fields.successVisible ?? false,
    runtimeLifecycle: fields.runtimeLifecycle ?? null,
    runtimeDisplayKind: fields.runtimeDisplayKind ?? null,
    runtimeQueueLength: fields.runtimeQueueLength ?? 0,
    notificationScreenClaimed: fields.notificationScreenClaimed ?? false,
    nextItemMaterialized: fields.nextItemMaterialized ?? false,
    chainExplicitlyEmpty: fields.chainExplicitlyEmpty ?? false,
    elapsedMs: fields.elapsedMs ?? fields.heldMs ?? null,
  };
}

export function buildSuccessPresentationHandoffTraceFields(
  input: SuccessPresentationHandoffHoldInput,
  reason: SuccessPresentationHandoffReleaseReason,
  extras: {
    successVisible: boolean;
    elapsedMs: number | null;
  },
): SuccessPresentationHandoffTraceFields {
  return {
    reason,
    successVisible: extras.successVisible,
    runtimeLifecycle: input.runtimeLifecycle ?? null,
    runtimeDisplayKind: input.runtimeDisplayKind,
    runtimeQueueLength: input.runtimeQueueLength,
    notificationScreenClaimed: input.notificationPresentationClaimed,
    nextItemMaterialized:
      input.runtimeDisplayKind != null || input.runtimeDisplayPayloadPresent,
    chainExplicitlyEmpty: input.chainExplicitlyEmpty,
    elapsedMs: extras.elapsedMs,
  };
}

/** @deprecated */
export function buildSuccessEmptyShellHoldTraceFields(
  input: SuccessPresentationHandoffHoldInput & {
    runtimePendingCount?: number;
    drainPrefetchInFlight?: boolean;
  },
  releaseReason: SuccessPresentationHandoffReleaseReason,
  heldMs: number | null,
): SuccessDrainEmptyShellHoldTraceFields {
  return {
    ...buildSuccessPresentationHandoffTraceFields(input, releaseReason, {
      successVisible: false,
      elapsedMs: heldMs,
    }),
    releaseReason,
    runtimePendingCount: input.runtimePendingCount ?? 0,
    drainPrefetchInFlight: input.drainPrefetchInFlight ?? false,
    heldMs,
  };
}
