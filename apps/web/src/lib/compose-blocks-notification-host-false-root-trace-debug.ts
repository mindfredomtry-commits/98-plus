'use client';

import { checkOverlayKey } from '@/lib/overlay-queue';
import { isClientDiagTraceEnvironment } from '@/lib/diag-trace-client';
import {
  readShellCheckActionMarkers,
  type ShellCheckActionMarkers,
} from '@/lib/shell-check-lifecycle-trace-debug';
import type { CheckOverlayParentReturnedBranch } from '@/lib/check-overlay-parent-return-branch-trace-debug';

export type ComposeBlocksNotificationHostFalseRootCause =
  | 'send-compose-phase-not-idle'
  | 'reply-compose-active'
  | 'send-compose-phase-idle'
  | 'reply-compose-inactive'
  | 'compose-not-blocking-host'
  | 'unknown';

export type ComposeBlocksNotificationHostOperand = {
  name: string;
  value: string | boolean | null;
};

export type ComposeBlocksNotificationHostFalseRootInput = {
  previousReturnedBranch: CheckOverlayParentReturnedBranch | null;
  currentReturnedBranch: 'visual-shield-blocked';
  pathKey: 'queue-shell';
  reason: string;
  checkBanId: string | null;
  composeBlocksNotificationHost: boolean;
  sendComposePhase: 'idle' | 'selectingTarget' | 'composingBan' | 'confirming';
  replyComposeActive: boolean;
  shellKind: string | null;
  renderBranch: string | null;
  ownerDisplayKind: string | null;
  currentHeadKind: string | null;
  activeNotificationChain: boolean;
  notificationOverlayVisible: boolean;
  visualQueueDimSessionLive: boolean;
  globalOverlayHostActive: boolean;
  overlayVisualShieldHostMounted: boolean;
  shouldMountNotificationOverlayHostFromGuards: boolean;
  overlayVisualShieldCardContentMounted: boolean;
  queueLen: number;
  ownerQueueLen: number;
};

const emittedKeys = new Set<string>();

function hasExpectedExitMarkersFalse(markers: ShellCheckActionMarkers): boolean {
  return (
    !markers.userPressedCheckYes &&
    !markers.userPressedCheckNo &&
    !markers.submitCheckAnswerStarted &&
    !markers.checkDismissStarted &&
    !markers.checkConsumed &&
    !markers.resultArrivedAfterCheck
  );
}

function checkIsActive(input: ComposeBlocksNotificationHostFalseRootInput): boolean {
  return (
    input.previousReturnedBranch === 'check-overlay' ||
    input.shellKind === 'check' ||
    input.renderBranch === 'shell-check' ||
    input.currentHeadKind === 'check' ||
    input.ownerDisplayKind === 'check'
  );
}

function evaluateComposeOperands(input: {
  sendComposePhase: ComposeBlocksNotificationHostFalseRootInput['sendComposePhase'];
  replyComposeActive: boolean;
}): {
  operands: ComposeBlocksNotificationHostOperand[];
  sendComposePhaseNotIdle: boolean;
  composeExpressionResult: boolean;
  firstFalseOperand: string | null;
  allFalseOperands: string[];
} {
  const sendComposePhaseNotIdle = input.sendComposePhase !== 'idle';
  const operands: ComposeBlocksNotificationHostOperand[] = [
    { name: 'sendComposePhase', value: input.sendComposePhase },
    { name: 'sendComposePhaseNotIdle', value: sendComposePhaseNotIdle },
    { name: 'replyComposeActive', value: input.replyComposeActive },
  ];
  const composeExpressionResult =
    sendComposePhaseNotIdle || input.replyComposeActive;

  if (composeExpressionResult) {
    return {
      operands,
      sendComposePhaseNotIdle,
      composeExpressionResult,
      firstFalseOperand: null,
      allFalseOperands: [],
    };
  }

  return {
    operands,
    sendComposePhaseNotIdle,
    composeExpressionResult,
    firstFalseOperand: 'sendComposePhaseNotIdle',
    allFalseOperands: ['sendComposePhaseNotIdle', 'replyComposeActive'],
  };
}

function resolveRootCause(input: {
  composeExpressionResult: boolean;
  sendComposePhaseNotIdle: boolean;
  replyComposeActive: boolean;
}): ComposeBlocksNotificationHostFalseRootCause {
  if (!input.composeExpressionResult) {
    return 'compose-not-blocking-host';
  }
  if (input.sendComposePhaseNotIdle) {
    return 'send-compose-phase-not-idle';
  }
  if (input.replyComposeActive) {
    return 'reply-compose-active';
  }
  return 'unknown';
}

export function maybeEmitComposeBlocksNotificationHostFalseRootTrace(
  input: ComposeBlocksNotificationHostFalseRootInput,
): void {
  if (!isClientDiagTraceEnvironment()) return;
  if (input.previousReturnedBranch !== 'check-overlay') return;
  if (input.composeBlocksNotificationHost !== false) return;
  if (!checkIsActive(input)) return;

  const markers = readShellCheckActionMarkers();
  if (!hasExpectedExitMarkersFalse(markers)) return;

  const checkBanId = input.checkBanId?.trim() || null;
  const checkOverlayKeyValue = checkBanId ? checkOverlayKey(checkBanId) : null;
  if (!checkOverlayKeyValue) return;
  if (emittedKeys.has(checkOverlayKeyValue)) return;
  emittedKeys.add(checkOverlayKeyValue);

  const composeEval = evaluateComposeOperands({
    sendComposePhase: input.sendComposePhase,
    replyComposeActive: input.replyComposeActive,
  });

  console.error('COMPOSE_BLOCKS_NOTIFICATION_HOST_FALSE_ROOT_TRACE', {
    checkBanId,
    checkOverlayKey: checkOverlayKeyValue,
    previousReturnedBranch: input.previousReturnedBranch,
    currentReturnedBranch: input.currentReturnedBranch,
    pathKey: input.pathKey,
    reason: input.reason,
    composeBlocksNotificationHost: input.composeBlocksNotificationHost,
    composeExpressionResult: composeEval.composeExpressionResult,
    firstFalseOperand: composeEval.firstFalseOperand,
    allFalseOperands: composeEval.allFalseOperands,
    composeOperands: composeEval.operands,
    shellKind: input.shellKind,
    renderBranch: input.renderBranch,
    ownerDisplayKind: input.ownerDisplayKind,
    currentHeadKind: input.currentHeadKind,
    activeNotificationChain: input.activeNotificationChain,
    notificationOverlayVisible: input.notificationOverlayVisible,
    visualQueueDimSessionLive: input.visualQueueDimSessionLive,
    globalOverlayHostActive: input.globalOverlayHostActive,
    overlayVisualShieldHostMounted: input.overlayVisualShieldHostMounted,
    shouldMountNotificationOverlayHostFromGuards:
      input.shouldMountNotificationOverlayHostFromGuards,
    overlayVisualShieldCardContentMounted: input.overlayVisualShieldCardContentMounted,
    queueLen: input.queueLen,
    ownerQueueLen: input.ownerQueueLen,
    expectedExitMarkers: markers,
    ROOT_CAUSE: resolveRootCause({
      composeExpressionResult: composeEval.composeExpressionResult,
      sendComposePhaseNotIdle: composeEval.sendComposePhaseNotIdle,
      replyComposeActive: input.replyComposeActive,
    }),
  });
}
