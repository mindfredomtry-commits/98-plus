'use client';

import {
  diagTraceNow,
  emitClientDiagTrace,
  isClientDiagTraceEnvironment,
} from '@/lib/diag-trace-client';

export type OverlayShellEmptyWhileQueueActiveReason =
  | 'queue-active-shell-kind-null'
  | 'queue-active-shell-hidden'
  | 'queue-active-base-has-no-overlay';

export type OverlayShellEmptyWhileQueueActiveTrace = {
  timestamp: number;
  ownerQueueLen: number;
  ownerPendingLen: number;
  overlayQueueLength: number;
  activeKind: string | null;
  activeOverlayKind: string | null;
  shellKind: string | null;
  effectiveKind: string | null;
  actualKind: string | null;
  visible: boolean;
  hasOverlay: boolean;
  baseLobbyHasOverlay: boolean;
  overlayKind: string | null;
  notificationOverlayVisible: boolean;
  visualQueueDimSessionLive: boolean;
  backdropMounted: boolean;
  backdropActive: boolean;
  queueHeadKind: string | null;
  resultOverlayMounted: boolean;
  incomingOverlayMounted: boolean;
  checkOverlayMounted: boolean;
  reason: OverlayShellEmptyWhileQueueActiveReason;
};

let emittedSig = '';

export function resolveOverlayShellEmptyWhileQueueActiveReason(input: {
  actualKind: string | null;
  visible: boolean;
  hasOverlay: boolean;
}): OverlayShellEmptyWhileQueueActiveReason | null {
  if (input.actualKind == null) return 'queue-active-shell-kind-null';
  if (!input.visible) return 'queue-active-shell-hidden';
  if (!input.hasOverlay) return 'queue-active-base-has-no-overlay';
  return null;
}

function shouldEmitOverlayShellEmptyWhileQueueActive(input: {
  ownerQueueLen: number;
  ownerPendingLen: number;
  visualQueueDimSessionLive: boolean;
  actualKind: string | null;
  visible: boolean;
  hasOverlay: boolean;
  sendFlowOpening: boolean;
}): boolean {
  if (input.sendFlowOpening) return false;
  const queueOrDimActive =
    input.ownerQueueLen > 0 ||
    input.ownerPendingLen > 0 ||
    input.visualQueueDimSessionLive === true;
  if (!queueOrDimActive) return false;
  return (
    input.actualKind == null ||
    input.visible === false ||
    input.hasOverlay === false
  );
}

export function traceOverlayShellEmptyWhileQueueActiveIfChanged(
  input: Omit<OverlayShellEmptyWhileQueueActiveTrace, 'timestamp' | 'reason'> & {
    sendFlowOpening: boolean;
  },
): void {
  if (!isClientDiagTraceEnvironment()) return;
  if (
    !shouldEmitOverlayShellEmptyWhileQueueActive({
      ownerQueueLen: input.ownerQueueLen,
      ownerPendingLen: input.ownerPendingLen,
      visualQueueDimSessionLive: input.visualQueueDimSessionLive,
      actualKind: input.actualKind,
      visible: input.visible,
      hasOverlay: input.hasOverlay,
      sendFlowOpening: input.sendFlowOpening,
    })
  ) {
    return;
  }

  const reason = resolveOverlayShellEmptyWhileQueueActiveReason({
    actualKind: input.actualKind,
    visible: input.visible,
    hasOverlay: input.hasOverlay,
  });
  if (reason == null) return;

  const {
    sendFlowOpening: _sendFlowOpening,
    ...fields
  } = input;
  const payload: OverlayShellEmptyWhileQueueActiveTrace = {
    timestamp: diagTraceNow(),
    ...fields,
    reason,
  };

  const sig = [
    payload.reason,
    payload.ownerQueueLen,
    payload.ownerPendingLen,
    payload.overlayQueueLength,
    payload.activeKind,
    payload.activeOverlayKind,
    payload.shellKind,
    payload.effectiveKind,
    payload.actualKind,
    payload.visible,
    payload.hasOverlay,
    payload.baseLobbyHasOverlay,
    payload.overlayKind,
    payload.notificationOverlayVisible,
    payload.visualQueueDimSessionLive,
    payload.backdropMounted,
    payload.backdropActive,
    payload.queueHeadKind,
    payload.resultOverlayMounted,
    payload.incomingOverlayMounted,
    payload.checkOverlayMounted,
  ].join('|');
  if (emittedSig === sig) return;
  emittedSig = sig;

  emitClientDiagTrace('OVERLAY_SHELL_EMPTY_WHILE_QUEUE_ACTIVE', payload);
}
