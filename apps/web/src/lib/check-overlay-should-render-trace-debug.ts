'use client';

import { getCheckModalView } from '@98plus/shared';
import type { BanInteraction } from '@98plus/shared';
import { checkOverlayKey } from '@/lib/overlay-queue';
import {
  diagTraceNow,
  emitClientDiagTrace,
  isClientDiagTraceEnvironment,
} from '@/lib/diag-trace-client';
import {
  readShellCheckActionMarkers,
  type ShellCheckActionMarkers,
} from '@/lib/shell-check-lifecycle-trace-debug';

export type CheckOverlayShouldRenderPath =
  | 'queue-shell'
  | 'queue-shell-without-ban'
  | 'direct';

export type CheckOverlayShouldRenderGateOperands = {
  overlaySessionOpen: boolean;
  globalOverlayHostEmit: boolean;
  overlayVisualShieldCardContentMounted: boolean;
  queueShellRendersResultOverlay: boolean;
  queueResultOverlayClaimed: boolean;
  displayKindIsCheck: boolean;
  showCheckOverlayDirect: boolean;
  checkBanForShellPresent: boolean;
  directParentBranchAllowed: boolean;
  ownerPrimaryCheckBanPresent: boolean;
};

export type CheckOverlayActualRenderFields = {
  actualQueueShellCheckElementCreated: boolean;
  actualReturnedBranch: string;
  resultBranchSelected: boolean;
  overlayHostGatePassed: boolean;
  visualShieldGatePassed: boolean;
  sessionGatePassed: boolean;
};

export type CheckOverlayWinningFalseConditionLabels =
  | 'overlay-session-closed'
  | 'global-overlay-host-not-emitting'
  | 'visual-shield-card-content-not-mounted'
  | 'result-overlay-branch-won'
  | 'result-overlay-claimed'
  | 'display-kind-not-check'
  | 'direct-check-path-won'
  | 'missing-check-payload'
  | 'direct-parent-branch-blocked'
  | 'direct-check-not-requested'
  | 'missing-direct-check-payload';

export type CheckOverlayShouldRenderOperands = CheckOverlayShouldRenderGateOperands & {
  shellKindIsCheck: boolean;
  renderBranchIsShellCheck: boolean;
  renderBranchIsShellCheckWithoutBan: boolean;
  checkShellBanIdPresent: boolean;
  checkPresentInQueues: boolean;
  hasRenderableCheck: boolean;
  checkVisibilityAllowed: boolean;
  queueShellCheckOverlayJsxPathSelected: boolean;
  queueShellCheckOverlayJsxWillEmit: boolean;
  blockedBySendFlow: boolean;
  blockedByDismiss: boolean;
  blockedByTransition: boolean;
  blockedByQueueEmpty: boolean;
  blockedByOwnerFalse: boolean;
  blockedByLegacyMismatch: boolean;
  blockedByNoActiveChain: boolean;
  blockedByOverlayHidden: boolean;
  innerShouldRenderExpression: boolean;
};

export type CheckOverlayShouldRenderContext = {
  shellKind: string | null;
  renderBranch: string | null;
  returnBranch: string | null;
  activeKind: string | null;
  ownerDisplayKind: string | null;
  currentHeadKind: string | null;
  notificationOverlayVisible: boolean | null;
  queueClaimsNotificationScreen: boolean | null;
  activeNotificationChain: boolean | null;
  visualQueueDimSessionLive: boolean | null;
};

export type CheckOverlayShouldRenderQueueFields = {
  ownerQueueLen: number;
  ownerQueueKinds: string[];
  ownerQueueIds: string[];
  ownerQueueKeys: string[];
  ownerPendingLen: number;
  ownerPendingKinds: string[];
  ownerPendingIds: string[];
  ownerPendingKeys: string[];
  overlayQueueRefLen: number;
  overlayQueueRefKinds: string[];
  overlayQueueRefIds: string[];
  overlayQueueRefKeys: string[];
  overlayQueueStateLen: number;
  overlayQueueStateKinds: string[];
  overlayQueueStateIds: string[];
  overlayQueueStateKeys: string[];
};

export type CheckOverlayShouldRenderPayload = {
  hasCheckPayload: boolean;
  hasCheckBan: boolean;
  checkBanId: string | null;
  checkOverlayKey: string | null;
  payloadValid: boolean;
  payloadSource: string | null;
};

export type CheckOverlayShouldRenderDecisionInput = {
  path: CheckOverlayShouldRenderPath;
  source: string;
  reason: string;
  calledFrom: string;
  nextShouldRender: boolean;
  exactExpressionResult: boolean;
  expressionLabel: string;
  conditionSourceFile: string;
  conditionSourceFunction: string;
  conditionSourceLine: string;
  operands: CheckOverlayShouldRenderOperands;
  context: CheckOverlayShouldRenderContext;
  payload: CheckOverlayShouldRenderPayload;
  queues: CheckOverlayShouldRenderQueueFields;
  gateOperands: CheckOverlayShouldRenderGateOperands;
  actualRenderFields: CheckOverlayActualRenderFields;
  innerShouldRenderExpression?: boolean | null;
};

type StoredShouldRenderSnapshot = CheckOverlayShouldRenderDecisionInput & {
  timestamp: number;
  shouldRender: boolean;
  stack: string;
  winningFalseConditions: Partial<Record<CheckOverlayWinningFalseConditionLabels, boolean>>;
  winningTrueConditions: Record<string, boolean>;
  firstFalseOperand: string | null;
  allFalseOperands: string[];
  decisionReason: string;
};

const previousShouldRenderByPath = new Map<
  CheckOverlayShouldRenderPath,
  boolean | null
>();
const previousSnapshotByPath = new Map<
  CheckOverlayShouldRenderPath,
  StoredShouldRenderSnapshot
>();
const rootCauseEmittedKeys = new Set<string>();

function captureStack(label: string): string {
  try {
    return new Error(label).stack ?? '';
  } catch {
    return '';
  }
}

function hasExpectedExitMarkers(markers: ShellCheckActionMarkers): boolean {
  return (
    markers.userPressedCheckYes ||
    markers.userPressedCheckNo ||
    markers.submitCheckAnswerStarted ||
    markers.checkDismissStarted ||
    markers.checkConsumed ||
    markers.resultArrivedAfterCheck
  );
}

function falseOperandsForQueueShellActualPath(
  gates: CheckOverlayShouldRenderGateOperands,
): string[] {
  const out: string[] = [];
  if (!gates.overlaySessionOpen) out.push('overlaySessionOpen');
  if (!gates.globalOverlayHostEmit) out.push('globalOverlayHostEmit');
  if (!gates.overlayVisualShieldCardContentMounted) {
    out.push('overlayVisualShieldCardContentMounted');
  }
  if (gates.queueShellRendersResultOverlay) {
    out.push('queueShellRendersResultOverlay');
  }
  if (gates.queueResultOverlayClaimed) out.push('queueResultOverlayClaimed');
  if (!gates.displayKindIsCheck) out.push('!displayKindIsCheck');
  if (gates.showCheckOverlayDirect) out.push('showCheckOverlayDirect');
  if (!gates.checkBanForShellPresent) out.push('!checkBanForShell');
  return out;
}

function falseOperandsForDirectActualPath(
  gates: CheckOverlayShouldRenderGateOperands,
): string[] {
  const out: string[] = [];
  if (!gates.directParentBranchAllowed) out.push('directParentBranchAllowed');
  if (!gates.showCheckOverlayDirect) out.push('!showCheckOverlayDirect');
  if (!gates.ownerPrimaryCheckBanPresent) out.push('!ownerPrimaryCheckBan');
  return out;
}

function falseOperandsForQueueShellWithoutBan(
  gates: CheckOverlayShouldRenderGateOperands,
): string[] {
  const out: string[] = [];
  if (!gates.overlaySessionOpen) out.push('overlaySessionOpen');
  if (!gates.globalOverlayHostEmit) out.push('globalOverlayHostEmit');
  if (!gates.overlayVisualShieldCardContentMounted) {
    out.push('overlayVisualShieldCardContentMounted');
  }
  if (!gates.displayKindIsCheck) out.push('!displayKindIsCheck');
  if (gates.checkBanForShellPresent) out.push('checkBanForShellPresent');
  return out;
}

function resolveFalseOperands(
  path: CheckOverlayShouldRenderPath,
  gates: CheckOverlayShouldRenderGateOperands,
): string[] {
  if (path === 'direct') return falseOperandsForDirectActualPath(gates);
  if (path === 'queue-shell-without-ban') {
    return falseOperandsForQueueShellWithoutBan(gates);
  }
  return falseOperandsForQueueShellActualPath(gates);
}

function buildActualWinningFalseConditions(
  path: CheckOverlayShouldRenderPath,
  gates: CheckOverlayShouldRenderGateOperands,
): Partial<Record<CheckOverlayWinningFalseConditionLabels, boolean>> {
  const out: Partial<Record<CheckOverlayWinningFalseConditionLabels, boolean>> =
    {};
  if (path === 'direct') {
    if (!gates.directParentBranchAllowed) {
      out['direct-parent-branch-blocked'] = true;
    }
    if (!gates.showCheckOverlayDirect) {
      out['direct-check-not-requested'] = true;
    }
    if (!gates.ownerPrimaryCheckBanPresent) {
      out['missing-direct-check-payload'] = true;
    }
    return out;
  }

  if (!gates.overlaySessionOpen) out['overlay-session-closed'] = true;
  if (!gates.globalOverlayHostEmit) {
    out['global-overlay-host-not-emitting'] = true;
  }
  if (!gates.overlayVisualShieldCardContentMounted) {
    out['visual-shield-card-content-not-mounted'] = true;
  }
  if (gates.queueShellRendersResultOverlay) {
    out['result-overlay-branch-won'] = true;
  }
  if (gates.queueResultOverlayClaimed) out['result-overlay-claimed'] = true;
  if (!gates.displayKindIsCheck) out['display-kind-not-check'] = true;
  if (gates.showCheckOverlayDirect) out['direct-check-path-won'] = true;
  if (!gates.checkBanForShellPresent) out['missing-check-payload'] = true;
  return out;
}

function buildWinningConditions(
  operands: CheckOverlayShouldRenderOperands,
  path: CheckOverlayShouldRenderPath,
  gates: CheckOverlayShouldRenderGateOperands,
): {
  winningFalseConditions: Partial<Record<CheckOverlayWinningFalseConditionLabels, boolean>>;
  winningTrueConditions: Record<string, boolean>;
} {
  const winningFalseConditions = buildActualWinningFalseConditions(path, gates);
  const winningTrueConditions: Record<string, boolean> = {};

  if (gates.overlaySessionOpen) winningTrueConditions.sessionGatePassed = true;
  if (gates.globalOverlayHostEmit) {
    winningTrueConditions.overlayHostGatePassed = true;
  }
  if (gates.overlayVisualShieldCardContentMounted) {
    winningTrueConditions.visualShieldGatePassed = true;
  }
  if (operands.checkPresentInQueues) {
    winningTrueConditions.checkPresentInQueues = true;
  }
  if (operands.hasRenderableCheck) {
    winningTrueConditions.hasRenderableCheck = true;
  }
  if (operands.checkVisibilityAllowed) {
    winningTrueConditions.checkVisibilityAllowed = true;
  }
  if (operands.queueShellCheckOverlayJsxPathSelected) {
    winningTrueConditions.queueShellCheckOverlayJsxPathSelected = true;
  }
  if (operands.queueShellCheckOverlayJsxWillEmit) {
    winningTrueConditions.queueShellCheckOverlayJsxWillEmit = true;
  }
  if (operands.innerShouldRenderExpression) {
    winningTrueConditions.innerShouldRenderExpression = true;
  }

  return { winningFalseConditions, winningTrueConditions };
}

function buildDecisionReason(
  path: CheckOverlayShouldRenderPath,
  shouldRender: boolean,
  firstFalseOperand: string | null,
): string {
  if (shouldRender) return `${path}:should-render-true`;
  if (firstFalseOperand) return `${path}:false-at-${firstFalseOperand}`;
  return `${path}:should-render-false`;
}

function buildStoredSnapshot(
  input: CheckOverlayShouldRenderDecisionInput,
): StoredShouldRenderSnapshot {
  const allFalseOperands = resolveFalseOperands(input.path, input.gateOperands);
  const firstFalseOperand = allFalseOperands[0] ?? null;
  const { winningFalseConditions, winningTrueConditions } = buildWinningConditions(
    input.operands,
    input.path,
    input.gateOperands,
  );
  const shouldRender = input.nextShouldRender;
  return {
    ...input,
    timestamp: diagTraceNow(),
    shouldRender,
    stack: captureStack('CHECK_OVERLAY_SHOULD_RENDER_DECISION_TRACE'),
    winningFalseConditions,
    winningTrueConditions,
    firstFalseOperand,
    allFalseOperands,
    decisionReason: buildDecisionReason(
      input.path,
      shouldRender,
      firstFalseOperand,
    ),
  };
}

function buildTracePayload(snapshot: StoredShouldRenderSnapshot) {
  const previousActualWillRender =
    previousShouldRenderByPath.get(snapshot.path) ?? null;
  return {
    timestamp: snapshot.timestamp,
    source: snapshot.source,
    reason: snapshot.reason,
    calledFrom: snapshot.calledFrom,
    stack: snapshot.stack,
    path: snapshot.path,
    previousShouldRender: previousActualWillRender,
    nextShouldRender: snapshot.shouldRender,
    previousActualWillRender,
    nextActualWillRender: snapshot.shouldRender,
    decisionReason: snapshot.decisionReason,
    winningFalseConditions: snapshot.winningFalseConditions,
    winningTrueConditions: snapshot.winningTrueConditions,
    exactExpressionResult: snapshot.exactExpressionResult,
    firstFalseOperand: snapshot.firstFalseOperand,
    allFalseOperands: snapshot.allFalseOperands,
    expressionLabel: snapshot.expressionLabel,
    conditionSourceFile: snapshot.conditionSourceFile,
    conditionSourceFunction: snapshot.conditionSourceFunction,
    conditionSourceLine: snapshot.conditionSourceLine,
    innerShouldRenderExpression: snapshot.innerShouldRenderExpression ?? null,
    actualQueueShellCheckElementCreated:
      snapshot.actualRenderFields.actualQueueShellCheckElementCreated,
    actualReturnedBranch: snapshot.actualRenderFields.actualReturnedBranch,
    resultBranchSelected: snapshot.actualRenderFields.resultBranchSelected,
    overlayHostGatePassed: snapshot.actualRenderFields.overlayHostGatePassed,
    visualShieldGatePassed: snapshot.actualRenderFields.visualShieldGatePassed,
    sessionGatePassed: snapshot.actualRenderFields.sessionGatePassed,
    gateOperands: snapshot.gateOperands,
    shellKind: snapshot.context.shellKind,
    renderBranch: snapshot.context.renderBranch,
    returnBranch: snapshot.context.returnBranch,
    activeKind: snapshot.context.activeKind,
    ownerDisplayKind: snapshot.context.ownerDisplayKind,
    currentHeadKind: snapshot.context.currentHeadKind,
    notificationOverlayVisible: snapshot.context.notificationOverlayVisible,
    queueClaimsNotificationScreen: snapshot.context.queueClaimsNotificationScreen,
    activeNotificationChain: snapshot.context.activeNotificationChain,
    visualQueueDimSessionLive: snapshot.context.visualQueueDimSessionLive,
    hasCheckPayload: snapshot.payload.hasCheckPayload,
    hasCheckBan: snapshot.payload.hasCheckBan,
    checkBanId: snapshot.payload.checkBanId,
    checkOverlayKey: snapshot.payload.checkOverlayKey,
    payloadValid: snapshot.payload.payloadValid,
    payloadSource: snapshot.payload.payloadSource,
    operands: snapshot.operands,
    ownerQueueLen: snapshot.queues.ownerQueueLen,
    ownerQueueKinds: snapshot.queues.ownerQueueKinds,
    ownerQueueIds: snapshot.queues.ownerQueueIds,
    ownerQueueKeys: snapshot.queues.ownerQueueKeys,
    ownerPendingLen: snapshot.queues.ownerPendingLen,
    ownerPendingKinds: snapshot.queues.ownerPendingKinds,
    ownerPendingIds: snapshot.queues.ownerPendingIds,
    ownerPendingKeys: snapshot.queues.ownerPendingKeys,
    overlayQueueRefLen: snapshot.queues.overlayQueueRefLen,
    overlayQueueRefKinds: snapshot.queues.overlayQueueRefKinds,
    overlayQueueRefIds: snapshot.queues.overlayQueueRefIds,
    overlayQueueRefKeys: snapshot.queues.overlayQueueRefKeys,
    overlayQueueStateLen: snapshot.queues.overlayQueueStateLen,
    overlayQueueStateKinds: snapshot.queues.overlayQueueStateKinds,
    overlayQueueStateIds: snapshot.queues.overlayQueueStateIds,
    overlayQueueStateKeys: snapshot.queues.overlayQueueStateKeys,
  };
}

function maybeEmitRootCause(
  previous: StoredShouldRenderSnapshot | undefined,
  current: StoredShouldRenderSnapshot,
): void {
  if (!previous || previous.shouldRender !== true || current.shouldRender !== false) {
    return;
  }
  const shellStillCheck =
    current.context.shellKind === 'check' ||
    current.context.renderBranch === 'shell-check' ||
    current.context.renderBranch === 'shell-check-without-ban';
  if (!shellStillCheck) return;
  if (current.context.activeNotificationChain !== true) return;
  if (current.context.notificationOverlayVisible !== true) return;

  const markers = readShellCheckActionMarkers();
  const unexpected = !hasExpectedExitMarkers(markers);
  const key = [
    current.path,
    current.payload.checkBanId ?? 'no-ban',
    previous.timestamp,
    current.timestamp,
  ].join('|');
  if (rootCauseEmittedKeys.has(key)) return;
  rootCauseEmittedKeys.add(key);

  emitClientDiagTrace('CHECK_OVERLAY_SHOULD_RENDER_FALSE_ROOT_CAUSE_TRACE', {
    ...buildTracePayload(current),
    snapshotBefore: buildTracePayload(previous),
    snapshotAfter: buildTracePayload(current),
    unexpected,
    expectedExitMarkers: markers,
  });
}

export function buildCheckOverlayShouldRenderPayload(input: {
  checkBan: BanInteraction | null;
  userId?: string | null;
  payloadSource: string | null;
}): CheckOverlayShouldRenderPayload {
  const checkBanId = input.checkBan?.id?.trim() || null;
  const modalView = input.checkBan
    ? getCheckModalView(input.checkBan, input.userId ?? null)
    : null;
  const hasCheckPayload = input.checkBan != null;
  const hasCheckBan = checkBanId != null;
  const payloadValid = hasCheckPayload && hasCheckBan && modalView != null;
  return {
    hasCheckPayload,
    hasCheckBan,
    checkBanId,
    checkOverlayKey: checkBanId ? checkOverlayKey(checkBanId) : null,
    payloadValid,
    payloadSource: input.payloadSource,
  };
}

export function observeCheckOverlayShouldRenderDecision(
  input: CheckOverlayShouldRenderDecisionInput,
): void {
  if (!isClientDiagTraceEnvironment()) return;

  const previous = previousShouldRenderByPath.get(input.path) ?? null;
  const next = input.nextShouldRender;
  if (previous === next) return;

  const snapshot = buildStoredSnapshot(input);
  const previousSnapshot = previousSnapshotByPath.get(input.path);

  emitClientDiagTrace(
    'CHECK_OVERLAY_SHOULD_RENDER_DECISION_TRACE',
    buildTracePayload(snapshot),
  );

  maybeEmitRootCause(previousSnapshot, snapshot);

  previousShouldRenderByPath.set(input.path, next);
  previousSnapshotByPath.set(input.path, snapshot);
}

export type ProbeQueueShellCheckOverlayShouldRenderInput = {
  source: string;
  reason: string;
  calledFrom: string;
  nextShouldRender: boolean;
  innerShouldRenderExpression: boolean;
  overlaySessionOpen: boolean;
  globalOverlayHostEmit: boolean;
  overlayVisualShieldCardContentMounted: boolean;
  actualReturnedBranch: string;
  queueResultOverlayClaimed: boolean;
  queueShellRendersResultOverlay: boolean;
  showCheckOverlayDirect: boolean;
  notificationQueueShellDisplayKindResolved: string | null;
  renderBranch: string | null;
  returnBranch: string | null;
  checkBanForShell: BanInteraction | null;
  ownerPrimaryCheckBanPresent: boolean;
  checkShellBanIdPresent: boolean;
  ownerCheckQueueVisibilityVisible: boolean;
  queueShellCheckOverlayJsxPathSelected: boolean;
  queueShellCheckOverlayJsxWillEmit: boolean;
  composeBlocksNotificationHost: boolean;
  notificationChainTransitioning: boolean;
  notificationOverlayVisible: boolean;
  activeNotificationChain: boolean;
  visualQueueDimSessionLive: boolean;
  queueClaimsNotificationScreen: boolean;
  activeKind: string | null;
  ownerDisplayKind: string | null;
  currentHeadKind: string | null;
  checkPresentInQueues: boolean;
  ownerQueueEmpty: boolean;
  userId?: string | null;
  queues: CheckOverlayShouldRenderQueueFields;
  expressionLabel?: string;
  conditionSourceLine?: string;
};

function buildGateOperandsFromProbe(
  input: Pick<
    ProbeQueueShellCheckOverlayShouldRenderInput,
    | 'overlaySessionOpen'
    | 'globalOverlayHostEmit'
    | 'overlayVisualShieldCardContentMounted'
    | 'queueShellRendersResultOverlay'
    | 'queueResultOverlayClaimed'
    | 'showCheckOverlayDirect'
    | 'notificationQueueShellDisplayKindResolved'
    | 'checkBanForShell'
    | 'ownerPrimaryCheckBanPresent'
  >,
): CheckOverlayShouldRenderGateOperands {
  const displayKindIsCheck =
    input.notificationQueueShellDisplayKindResolved === 'check';
  return {
    overlaySessionOpen: input.overlaySessionOpen,
    globalOverlayHostEmit: input.globalOverlayHostEmit,
    overlayVisualShieldCardContentMounted:
      input.overlayVisualShieldCardContentMounted,
    queueShellRendersResultOverlay: input.queueShellRendersResultOverlay,
    queueResultOverlayClaimed: input.queueResultOverlayClaimed,
    displayKindIsCheck,
    showCheckOverlayDirect: input.showCheckOverlayDirect,
    checkBanForShellPresent: Boolean(input.checkBanForShell),
    directParentBranchAllowed: input.overlaySessionOpen,
    ownerPrimaryCheckBanPresent: input.ownerPrimaryCheckBanPresent,
  };
}

function buildActualRenderFieldsFromProbe(
  input: Pick<
    ProbeQueueShellCheckOverlayShouldRenderInput,
    | 'nextShouldRender'
    | 'actualReturnedBranch'
    | 'queueShellRendersResultOverlay'
    | 'globalOverlayHostEmit'
    | 'overlayVisualShieldCardContentMounted'
    | 'overlaySessionOpen'
  >,
): CheckOverlayActualRenderFields {
  return {
    actualQueueShellCheckElementCreated: input.nextShouldRender,
    actualReturnedBranch: input.actualReturnedBranch,
    resultBranchSelected: input.queueShellRendersResultOverlay,
    overlayHostGatePassed: input.globalOverlayHostEmit,
    visualShieldGatePassed: input.overlayVisualShieldCardContentMounted,
    sessionGatePassed: input.overlaySessionOpen,
  };
}

export function probeQueueShellCheckOverlayShouldRender(
  input: ProbeQueueShellCheckOverlayShouldRenderInput,
): void {
  if (!isClientDiagTraceEnvironment()) return;
  return;

  const gateOperands = buildGateOperandsFromProbe(input);
  const displayKindIsCheck = gateOperands.displayKindIsCheck;
  const checkBanForShellPresent = gateOperands.checkBanForShellPresent;
  const operands: CheckOverlayShouldRenderOperands = {
    ...gateOperands,
    shellKindIsCheck: displayKindIsCheck,
    renderBranchIsShellCheck: input.renderBranch === 'shell-check',
    renderBranchIsShellCheckWithoutBan:
      input.renderBranch === 'shell-check-without-ban',
    checkShellBanIdPresent: input.checkShellBanIdPresent,
    checkPresentInQueues: input.checkPresentInQueues,
    hasRenderableCheck:
      checkBanForShellPresent && input.ownerCheckQueueVisibilityVisible,
    checkVisibilityAllowed: input.ownerCheckQueueVisibilityVisible,
    queueShellCheckOverlayJsxPathSelected:
      input.queueShellCheckOverlayJsxPathSelected,
    queueShellCheckOverlayJsxWillEmit: input.queueShellCheckOverlayJsxWillEmit,
    blockedBySendFlow: input.composeBlocksNotificationHost,
    blockedByDismiss: false,
    blockedByTransition: input.notificationChainTransitioning,
    blockedByQueueEmpty: input.ownerQueueEmpty,
    blockedByOwnerFalse: false,
    blockedByLegacyMismatch: false,
    blockedByNoActiveChain: !input.activeNotificationChain,
    blockedByOverlayHidden: !input.notificationOverlayVisible,
    innerShouldRenderExpression: input.innerShouldRenderExpression,
  };
  observeCheckOverlayShouldRenderDecision({
    path: 'queue-shell',
    source: input.source,
    reason: input.reason,
    calledFrom: input.calledFrom,
    nextShouldRender: input.nextShouldRender,
    exactExpressionResult: input.nextShouldRender,
    expressionLabel:
      input.expressionLabel ?? 'queueShellWillActuallyRenderCheckOverlay',
    conditionSourceFile: 'Providers.tsx',
    conditionSourceFunction: 'ProvidersBody',
    conditionSourceLine:
      input.conditionSourceLine ?? 'queueShellWillActuallyRenderCheckOverlay',
    operands,
    gateOperands,
    actualRenderFields: buildActualRenderFieldsFromProbe(input),
    innerShouldRenderExpression: input.innerShouldRenderExpression,
    context: {
      shellKind: input.notificationQueueShellDisplayKindResolved,
      renderBranch: input.renderBranch,
      returnBranch: input.returnBranch,
      activeKind: input.activeKind,
      ownerDisplayKind: input.ownerDisplayKind,
      currentHeadKind: input.currentHeadKind,
      notificationOverlayVisible: input.notificationOverlayVisible,
      queueClaimsNotificationScreen: input.queueClaimsNotificationScreen,
      activeNotificationChain: input.activeNotificationChain,
      visualQueueDimSessionLive: input.visualQueueDimSessionLive,
    },
    payload: buildCheckOverlayShouldRenderPayload({
      checkBan: input.checkBanForShell,
      userId: input.userId,
      payloadSource: 'queue-shell',
    }),
    queues: input.queues,
  });
}

export type ProbeQueueShellCheckWithoutBanShouldRenderInput = Omit<
  ProbeQueueShellCheckOverlayShouldRenderInput,
  'nextShouldRender' | 'expressionLabel' | 'conditionSourceLine'
>;

export function probeQueueShellCheckWithoutBanShouldRender(
  input: ProbeQueueShellCheckWithoutBanShouldRenderInput,
): void {
  if (!isClientDiagTraceEnvironment()) return;
  return;

  const gateOperands = buildGateOperandsFromProbe(input);
  const displayKindIsCheck = gateOperands.displayKindIsCheck;
  const checkBanForShellPresent = gateOperands.checkBanForShellPresent;
  const operands: CheckOverlayShouldRenderOperands = {
    ...gateOperands,
    shellKindIsCheck: displayKindIsCheck,
    renderBranchIsShellCheck: input.renderBranch === 'shell-check',
    renderBranchIsShellCheckWithoutBan:
      input.renderBranch === 'shell-check-without-ban',
    checkShellBanIdPresent: input.checkShellBanIdPresent,
    checkPresentInQueues: input.checkPresentInQueues,
    hasRenderableCheck:
      checkBanForShellPresent && input.ownerCheckQueueVisibilityVisible,
    checkVisibilityAllowed: input.ownerCheckQueueVisibilityVisible,
    queueShellCheckOverlayJsxPathSelected:
      input.queueShellCheckOverlayJsxPathSelected,
    queueShellCheckOverlayJsxWillEmit: input.queueShellCheckOverlayJsxWillEmit,
    blockedBySendFlow: input.composeBlocksNotificationHost,
    blockedByDismiss: false,
    blockedByTransition: input.notificationChainTransitioning,
    blockedByQueueEmpty: input.ownerQueueEmpty,
    blockedByOwnerFalse: false,
    blockedByLegacyMismatch: false,
    blockedByNoActiveChain: !input.activeNotificationChain,
    blockedByOverlayHidden: !input.notificationOverlayVisible,
    innerShouldRenderExpression: input.innerShouldRenderExpression,
  };
  observeCheckOverlayShouldRenderDecision({
    path: 'queue-shell-without-ban',
    source: input.source,
    reason: input.reason || 'shell-check-without-ban',
    calledFrom: input.calledFrom || 'ProvidersBody:shell-check-without-ban',
    nextShouldRender: false,
    exactExpressionResult: false,
    expressionLabel: 'shell-check-without-ban',
    conditionSourceFile: 'Providers.tsx',
    conditionSourceFunction: 'ProvidersBody',
    conditionSourceLine: 'queueHeadLifecycleRenderBranch-shell-check-without-ban',
    operands,
    gateOperands,
    actualRenderFields: buildActualRenderFieldsFromProbe({
      ...input,
      nextShouldRender: false,
    }),
    innerShouldRenderExpression: input.innerShouldRenderExpression,
    context: {
      shellKind: input.notificationQueueShellDisplayKindResolved,
      renderBranch: input.renderBranch,
      returnBranch: input.returnBranch,
      activeKind: input.activeKind,
      ownerDisplayKind: input.ownerDisplayKind,
      currentHeadKind: input.currentHeadKind,
      notificationOverlayVisible: input.notificationOverlayVisible,
      queueClaimsNotificationScreen: input.queueClaimsNotificationScreen,
      activeNotificationChain: input.activeNotificationChain,
      visualQueueDimSessionLive: input.visualQueueDimSessionLive,
    },
    payload: buildCheckOverlayShouldRenderPayload({
      checkBan: input.checkBanForShell,
      userId: input.userId,
      payloadSource: 'queue-shell-without-ban',
    }),
    queues: input.queues,
  });
}

export type ProbeDirectCheckOverlayShouldRenderInput = {
  source: string;
  reason: string;
  calledFrom: string;
  nextShouldRender: boolean;
  innerShouldRenderExpression: boolean;
  directParentBranchAllowed: boolean;
  overlaySessionOpen: boolean;
  actualReturnedBranch: string;
  showCheckOverlayDirect: boolean;
  ownerPrimaryCheckBan: BanInteraction | null;
  renderBranch: string | null;
  shellKind: string | null;
  activeKind: string | null;
  ownerDisplayKind: string | null;
  currentHeadKind: string | null;
  notificationOverlayVisible: boolean;
  activeNotificationChain: boolean;
  visualQueueDimSessionLive: boolean;
  queueClaimsNotificationScreen: boolean;
  ownerCheckDirectVisibilityVisible: boolean;
  composeBlocksNotificationHost: boolean;
  notificationChainTransitioning: boolean;
  userId?: string | null;
  queues: CheckOverlayShouldRenderQueueFields;
};

export function probeDirectCheckOverlayShouldRender(
  input: ProbeDirectCheckOverlayShouldRenderInput,
): void {
  if (!isClientDiagTraceEnvironment()) return;
  return;

  const ownerPrimaryCheckBanPresent = Boolean(input.ownerPrimaryCheckBan);
  const gateOperands: CheckOverlayShouldRenderGateOperands = {
    overlaySessionOpen: input.overlaySessionOpen,
    globalOverlayHostEmit: false,
    overlayVisualShieldCardContentMounted: false,
    queueShellRendersResultOverlay: false,
    queueResultOverlayClaimed: false,
    displayKindIsCheck: input.shellKind === 'check',
    showCheckOverlayDirect: input.showCheckOverlayDirect,
    checkBanForShellPresent: false,
    directParentBranchAllowed: input.directParentBranchAllowed,
    ownerPrimaryCheckBanPresent,
  };
  const operands: CheckOverlayShouldRenderOperands = {
    ...gateOperands,
    shellKindIsCheck: input.shellKind === 'check',
    renderBranchIsShellCheck: input.renderBranch === 'shell-check',
    renderBranchIsShellCheckWithoutBan:
      input.renderBranch === 'shell-check-without-ban',
    checkShellBanIdPresent: ownerPrimaryCheckBanPresent,
    checkPresentInQueues: ownerPrimaryCheckBanPresent,
    hasRenderableCheck:
      ownerPrimaryCheckBanPresent && input.ownerCheckDirectVisibilityVisible,
    checkVisibilityAllowed: input.ownerCheckDirectVisibilityVisible,
    queueShellCheckOverlayJsxPathSelected: false,
    queueShellCheckOverlayJsxWillEmit: false,
    blockedBySendFlow: input.composeBlocksNotificationHost,
    blockedByDismiss: false,
    blockedByTransition: input.notificationChainTransitioning,
    blockedByQueueEmpty: false,
    blockedByOwnerFalse: false,
    blockedByLegacyMismatch: false,
    blockedByNoActiveChain: !input.activeNotificationChain,
    blockedByOverlayHidden: !input.notificationOverlayVisible,
    innerShouldRenderExpression: input.innerShouldRenderExpression,
  };
  observeCheckOverlayShouldRenderDecision({
    path: 'direct',
    source: input.source,
    reason: input.reason,
    calledFrom: input.calledFrom,
    nextShouldRender: input.nextShouldRender,
    exactExpressionResult: input.nextShouldRender,
    expressionLabel: 'directWillActuallyRenderCheckOverlay',
    conditionSourceFile: 'Providers.tsx',
    conditionSourceFunction: 'ProvidersBody',
    conditionSourceLine: 'directWillActuallyRenderCheckOverlay',
    operands,
    gateOperands,
    actualRenderFields: {
      actualQueueShellCheckElementCreated: false,
      actualReturnedBranch: input.actualReturnedBranch,
      resultBranchSelected: false,
      overlayHostGatePassed: false,
      visualShieldGatePassed: false,
      sessionGatePassed: input.overlaySessionOpen,
    },
    innerShouldRenderExpression: input.innerShouldRenderExpression,
    context: {
      shellKind: input.shellKind,
      renderBranch: input.renderBranch,
      returnBranch: input.renderBranch,
      activeKind: input.activeKind,
      ownerDisplayKind: input.ownerDisplayKind,
      currentHeadKind: input.currentHeadKind,
      notificationOverlayVisible: input.notificationOverlayVisible,
      queueClaimsNotificationScreen: input.queueClaimsNotificationScreen,
      activeNotificationChain: input.activeNotificationChain,
      visualQueueDimSessionLive: input.visualQueueDimSessionLive,
    },
    payload: buildCheckOverlayShouldRenderPayload({
      checkBan: input.ownerPrimaryCheckBan,
      userId: input.userId,
      payloadSource: 'check-direct',
    }),
    queues: input.queues,
  });
}
