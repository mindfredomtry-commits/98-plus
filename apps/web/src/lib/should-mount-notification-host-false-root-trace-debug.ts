'use client';

import { checkOverlayKey } from '@/lib/overlay-queue';
import { isClientDiagTraceEnvironment } from '@/lib/diag-trace-client';
import {
  readShellCheckActionMarkers,
  type ShellCheckActionMarkers,
} from '@/lib/shell-check-lifecycle-trace-debug';
import type { CheckOverlayParentReturnedBranch } from '@/lib/check-overlay-parent-return-branch-trace-debug';

export type ShouldMountHostGuardOperand = {
  name: string;
  value: string | boolean | number | null;
};

export type ShouldMountHostGuardEvaluation = {
  name: string;
  conditionResult: boolean;
};

export type ShouldMountHostGuardSnapshot = {
  reachedGuards: string[];
  evaluatedGuards: ShouldMountHostGuardEvaluation[];
  selectedFalseGuard: string | null;
  selectedFalseGuardResult: false | null;
  guardSourceFunction: string;
  guardSourceLine: string;
  selectedGuardOperands: ShouldMountHostGuardOperand[];
};

export type ShouldMountNotificationHostFalseRootInput = {
  previousReturnedBranch: CheckOverlayParentReturnedBranch | null;
  checkBanId: string | null;
  guardSnapshot: ShouldMountHostGuardSnapshot;
  shellKind: string | null;
  renderBranch: string | null;
  ownerDisplayKind: string | null;
  currentHeadKind: string | null;
  activeNotificationChain: boolean;
  notificationOverlayVisible: boolean;
  globalOverlayHostActive: boolean;
  visualQueueDimSessionLive: boolean;
  overlayVisualShieldHostMounted: boolean;
  composeBlocksNotificationHost: boolean;
  shouldMountNotificationOverlayHostFromGuards: boolean;
  overlayVisualShieldCardContentMounted: boolean;
  queueLen: number;
  ownerQueueLen: number;
};

export type ShouldMountHostGuardCollector = {
  markGuardReached: (name: string) => void;
  markGuardEvaluated: (name: string, conditionResult: boolean) => void;
  markGuardSelected: (
    name: string,
    operands: ShouldMountHostGuardOperand[],
    sourceLine: string,
  ) => void;
  getSnapshot: () => ShouldMountHostGuardSnapshot;
};

const emittedKeys = new Set<string>();
let lastShouldMountHostGuardSnapshot: ShouldMountHostGuardSnapshot | null = null;

export function createShouldMountHostGuardCollector(): ShouldMountHostGuardCollector {
  const reachedGuards: string[] = [];
  const evaluatedGuards: ShouldMountHostGuardEvaluation[] = [];
  let selectedFalseGuard: string | null = null;
  let guardSourceLine = 'unknown';
  let selectedGuardOperands: ShouldMountHostGuardOperand[] = [];

  return {
    markGuardReached(name: string) {
      reachedGuards.push(name);
    },
    markGuardEvaluated(name: string, conditionResult: boolean) {
      evaluatedGuards.push({ name, conditionResult });
    },
    markGuardSelected(
      name: string,
      operands: ShouldMountHostGuardOperand[],
      sourceLine: string,
    ) {
      selectedFalseGuard = name;
      guardSourceLine = sourceLine;
      selectedGuardOperands = operands;
    },
    getSnapshot(): ShouldMountHostGuardSnapshot {
      return {
        reachedGuards: [...reachedGuards],
        evaluatedGuards: [...evaluatedGuards],
        selectedFalseGuard,
        selectedFalseGuardResult: selectedFalseGuard ? false : null,
        guardSourceFunction:
          'ProvidersBody:shouldMountNotificationOverlayHostFromGuards',
        guardSourceLine,
        selectedGuardOperands: [...selectedGuardOperands],
      };
    },
  };
}

export function stageShouldMountHostGuardSnapshot(
  snapshot: ShouldMountHostGuardSnapshot,
): void {
  lastShouldMountHostGuardSnapshot = snapshot;
}

export function readShouldMountHostGuardSnapshot(): ShouldMountHostGuardSnapshot | null {
  return lastShouldMountHostGuardSnapshot;
}

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

export function maybeEmitShouldMountNotificationHostFalseRootTrace(
  input: ShouldMountNotificationHostFalseRootInput,
): void {
  if (!isClientDiagTraceEnvironment()) return;
  if (input.previousReturnedBranch !== 'check-overlay') return;
  if (input.composeBlocksNotificationHost !== false) return;
  if (input.shouldMountNotificationOverlayHostFromGuards !== false) return;

  const markers = readShellCheckActionMarkers();
  if (!hasExpectedExitMarkersFalse(markers)) return;

  const checkBanId = input.checkBanId?.trim() || null;
  const checkOverlayKeyValue = checkBanId ? checkOverlayKey(checkBanId) : null;
  if (!checkOverlayKeyValue) return;
  if (emittedKeys.has(checkOverlayKeyValue)) return;

  const snapshot = input.guardSnapshot;
  if (!snapshot.selectedFalseGuard) return;
  if (snapshot.selectedFalseGuard === 'compose-blocks-notification-host') return;

  emittedKeys.add(checkOverlayKeyValue);

  console.error('SHOULD_MOUNT_NOTIFICATION_HOST_FALSE_ROOT_TRACE', {
    checkBanId,
    checkOverlayKey: checkOverlayKeyValue,
    reachedGuards: snapshot.reachedGuards,
    evaluatedGuards: snapshot.evaluatedGuards,
    selectedFalseGuard: snapshot.selectedFalseGuard,
    selectedFalseGuardResult: snapshot.selectedFalseGuardResult,
    guardSourceFunction: snapshot.guardSourceFunction,
    guardSourceLine: snapshot.guardSourceLine,
    selectedGuardOperands: snapshot.selectedGuardOperands,
    previousReturnedBranch: input.previousReturnedBranch,
    shellKind: input.shellKind,
    renderBranch: input.renderBranch,
    ownerDisplayKind: input.ownerDisplayKind,
    currentHeadKind: input.currentHeadKind,
    activeNotificationChain: input.activeNotificationChain,
    notificationOverlayVisible: input.notificationOverlayVisible,
    globalOverlayHostActive: input.globalOverlayHostActive,
    visualQueueDimSessionLive: input.visualQueueDimSessionLive,
    overlayVisualShieldHostMounted: input.overlayVisualShieldHostMounted,
    composeBlocksNotificationHost: input.composeBlocksNotificationHost,
    shouldMountNotificationOverlayHostFromGuards:
      input.shouldMountNotificationOverlayHostFromGuards,
    overlayVisualShieldCardContentMounted: input.overlayVisualShieldCardContentMounted,
    queueLen: input.queueLen,
    ownerQueueLen: input.ownerQueueLen,
    expectedExitMarkers: markers,
    ROOT_CAUSE: snapshot.selectedFalseGuard,
  });
}
