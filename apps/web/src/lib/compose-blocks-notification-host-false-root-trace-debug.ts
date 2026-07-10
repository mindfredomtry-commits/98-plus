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
  _input: ComposeBlocksNotificationHostFalseRootInput,
): void {
  // Disabled in favor of SHOULD_MOUNT_NOTIFICATION_HOST_FALSE_ROOT_TRACE.
}
