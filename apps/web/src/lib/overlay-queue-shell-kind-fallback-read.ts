'use client';

import type { QueuedOverlay } from '@/lib/overlay-queue';
import { queueHeadIdFrom } from '@/lib/queue-head-lifecycle-trace-debug';
import {
  diagTraceNow,
  emitClientDiagTrace,
  isClientDiagTraceEnvironment,
} from '@/lib/diag-trace-client';

export type QueueHeadShellKindFallbackReadInput = {
  composeBlocksNotificationHost: boolean;
  showDirectOverboardLayer: boolean;
  ownerPrimaryShellQueueLen: number;
  ownerPrimaryShellPendingLen: number;
  ownerPrimaryQueueHead: QueuedOverlay | null;
  overlayQueueHead: QueuedOverlay | null;
  overlayQueueLength: number;
  visualQueueDimSessionLive: boolean;
  notificationOverlayVisible: boolean;
  queueClaimsNotificationScreen: boolean;
};

export type QueueHeadShellKindFallbackReadResult = {
  kind: QueuedOverlay['kind'] | null;
  usedOverlayFallback: boolean;
};

function isShellKind(
  kind: string | null | undefined,
): kind is QueuedOverlay['kind'] {
  return kind === 'check' || kind === 'incoming' || kind === 'result';
}

function shouldAllowOverlayQueueShellFallback(
  input: QueueHeadShellKindFallbackReadInput,
): boolean {
  return (
    input.visualQueueDimSessionLive ||
    input.notificationOverlayVisible ||
    input.queueClaimsNotificationScreen
  );
}

/** Owner-first shell kind fallback; overlay queue head when owner shell queue is empty. */
export function resolveQueueHeadShellKindFallbackRead(
  input: QueueHeadShellKindFallbackReadInput,
): QueueHeadShellKindFallbackReadResult {
  if (input.composeBlocksNotificationHost || input.showDirectOverboardLayer) {
    return { kind: null, usedOverlayFallback: false };
  }

  if (
    input.ownerPrimaryShellQueueLen > 0 ||
    input.ownerPrimaryShellPendingLen > 0
  ) {
    const head = input.ownerPrimaryQueueHead;
    if (!head || !isShellKind(head.kind)) {
      return { kind: null, usedOverlayFallback: false };
    }
    return { kind: head.kind, usedOverlayFallback: false };
  }

  if (
    input.overlayQueueLength <= 0 ||
    !input.overlayQueueHead ||
    !isShellKind(input.overlayQueueHead.kind)
  ) {
    return { kind: null, usedOverlayFallback: false };
  }

  if (!shouldAllowOverlayQueueShellFallback(input)) {
    return { kind: null, usedOverlayFallback: false };
  }

  return {
    kind: input.overlayQueueHead.kind,
    usedOverlayFallback: true,
  };
}

let emittedOverlayFallbackSig = '';

export function logOverlayQueueFallbackUsedForShell(input: {
  ownerPrimaryShellQueueLen: number;
  ownerPrimaryShellPendingLen: number;
  overlayQueueLength: number;
  overlayQueueHeadKind: string | null;
  overlayQueueHeadId: string | null;
  returnedKind: string | null;
  renderBranch: string | null;
  notificationOverlayVisible: boolean;
  visualQueueDimSessionLive: boolean;
  queueClaimsNotificationScreen: boolean;
}): void {
  if (!isClientDiagTraceEnvironment()) return;

  const sig = [
    input.ownerPrimaryShellQueueLen,
    input.ownerPrimaryShellPendingLen,
    input.overlayQueueLength,
    input.overlayQueueHeadKind,
    input.overlayQueueHeadId,
    input.returnedKind,
    input.renderBranch,
    input.notificationOverlayVisible,
    input.visualQueueDimSessionLive,
    input.queueClaimsNotificationScreen,
  ].join('|');
  if (emittedOverlayFallbackSig === sig) return;
  emittedOverlayFallbackSig = sig;

  emitClientDiagTrace('OVERLAY_QUEUE_FALLBACK_USED_FOR_SHELL', {
    timestamp: diagTraceNow(),
    ...input,
    reason: 'owner-empty-overlay-candidate-used-for-shell',
  });
}

export function overlayQueueHeadForShellFallbackRead(
  overlayQueue: readonly QueuedOverlay[],
  overlayQueueRefHead: QueuedOverlay | null | undefined,
): QueuedOverlay | null {
  return overlayQueueRefHead ?? overlayQueue[0] ?? null;
}

export { queueHeadIdFrom };
