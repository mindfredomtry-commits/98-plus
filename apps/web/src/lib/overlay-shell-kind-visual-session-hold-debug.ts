'use client';

import { getLastOverlayQueueMutationSnapshot } from '@/lib/overlay-queue-mutation-snapshot-debug';
import {
  diagTraceNow,
  emitClientDiagTrace,
  isClientDiagTraceEnvironment,
} from '@/lib/diag-trace-client';

export type OverlayShellWrapperKind = 'incoming' | 'check' | 'result';

let previousNonNullShellKind: OverlayShellWrapperKind | null = null;
let emittedHoldSig = '';

function isOverlayShellWrapperKind(
  value: string | null | undefined,
): value is OverlayShellWrapperKind {
  return value === 'incoming' || value === 'check' || value === 'result';
}

export function resolveNotificationShellKindWithVisualSessionHold(input: {
  requestedShellKind: string | null;
  visualQueueDimSessionLive: boolean;
  overlayQueueLength: number;
  ownerQueueLen: number;
  ownerPendingLen: number;
}): {
  shellKind: OverlayShellWrapperKind | null;
  held: boolean;
  previousNonNullShellKind: OverlayShellWrapperKind | null;
} {
  const requested = isOverlayShellWrapperKind(input.requestedShellKind)
    ? input.requestedShellKind
    : null;

  if (requested != null) {
    previousNonNullShellKind = requested;
  }

  if (!input.visualQueueDimSessionLive) {
    if (requested == null) {
      previousNonNullShellKind = null;
    }
    return {
      shellKind: requested,
      held: false,
      previousNonNullShellKind,
    };
  }

  const overlayMutation = getLastOverlayQueueMutationSnapshot();
  const shouldHold =
    previousNonNullShellKind != null &&
    requested == null &&
    overlayMutation?.operation === 'clear';

  if (!shouldHold) {
    return {
      shellKind: requested,
      held: false,
      previousNonNullShellKind,
    };
  }

  if (isClientDiagTraceEnvironment()) {
    const holdPayload = {
      previousNonNullShellKind,
      requestedShellKind: input.requestedShellKind,
      nextShellKind: previousNonNullShellKind,
      visualQueueDimSessionLive: input.visualQueueDimSessionLive,
      overlayQueueLength: input.overlayQueueLength,
      ownerQueueLen: input.ownerQueueLen,
      ownerPendingLen: input.ownerPendingLen,
      lastOverlayQueueMutationOperation: overlayMutation?.operation ?? null,
      reason: 'hold-shell-wrapper-until-visual-session-release',
    };
    const sig = [
      holdPayload.previousNonNullShellKind,
      holdPayload.requestedShellKind,
      holdPayload.nextShellKind,
      holdPayload.visualQueueDimSessionLive,
      holdPayload.overlayQueueLength,
      holdPayload.ownerQueueLen,
      holdPayload.ownerPendingLen,
      holdPayload.lastOverlayQueueMutationOperation,
    ].join('|');
    if (emittedHoldSig !== sig) {
      emittedHoldSig = sig;
      emitClientDiagTrace('OVERLAY_SHELL_KIND_HELD_DURING_VISUAL_SESSION', {
        timestamp: diagTraceNow(),
        ...holdPayload,
      });
    }
  }

  return {
    shellKind: previousNonNullShellKind,
    held: true,
    previousNonNullShellKind,
  };
}
