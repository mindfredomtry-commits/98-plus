'use client';

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
import type { CheckOverlayPayloadLifecycleContext } from '@/lib/check-overlay-payload-lifecycle-trace-debug';
import { buildCheckOverlayParentReturnBranchTimelineFields } from '@/lib/check-overlay-parent-return-branch-trace-debug';

export type CheckOverlayParentRenderSnapshot = CheckOverlayPayloadLifecycleContext & {
  parentComponent: string;
  parentRenderBranch: string;
  returnBranch: string;
  shouldRenderCheckOverlay: boolean;
  checkOverlayElementCreated: boolean;
  actualCheckOverlayElementCreated: boolean;
  checkOverlayKeyProp: string | null;
  checkBanId: string | null;
  checkOverlayKey: string | null;
  componentTypeName: string;
  componentIdentityToken: string;
  parentIdentityToken: string;
};

export type CheckOverlayParentRenderDecisionInput = {
  source: string;
  reason: string;
  calledFrom: string;
  snapshot: CheckOverlayParentRenderSnapshot;
};

export type CheckOverlayParentStopReason =
  | 'branch-changed'
  | 'should-render-false'
  | 'element-not-created'
  | 'key-changed'
  | 'component-type-changed'
  | 'parent-remounted'
  | 'parent-returned-other-branch'
  | 'unknown';

type ParentRenderHooks = {
  readContext: () => CheckOverlayPayloadLifecycleContext;
};

function buildFallbackCurrentSnapshot(): CheckOverlayParentRenderSnapshot | null {
  if (!lastCreatingSnapshot) return null;
  const ctx = hooks?.readContext() ?? emptyContext();
  const baseline = lastCommittedSnapshot ?? lastCreatingSnapshot;
  return {
    ...ctx,
    parentComponent: baseline.parentComponent,
    parentRenderBranch: ctx.renderBranch ?? baseline.parentRenderBranch,
    returnBranch: 'flush-no-staged-snapshot',
    shouldRenderCheckOverlay: false,
    checkOverlayElementCreated: false,
    actualCheckOverlayElementCreated: false,
    checkOverlayKeyProp: baseline.checkOverlayKeyProp,
    checkBanId: lastCreatingSnapshot.checkBanId,
    checkOverlayKey: lastCreatingSnapshot.checkOverlayKey,
    componentTypeName: 'CheckOverlay',
    componentIdentityToken: baseline.componentIdentityToken,
    parentIdentityToken: baseline.parentIdentityToken,
  };
}

type UnmountTimelineAnchor = {
  timestamp: number;
  checkBanId: string | null;
  checkOverlayKey: string | null;
  source: string;
  calledFrom: string;
  stack: string;
};

type GoToBansTimelineAnchor = {
  timestamp: number;
  handlerName: string;
  source: string;
  calledFrom: string;
  stack: string;
  banId: string | null;
};

let hooks: ParentRenderHooks | null = null;
let pendingSnapshot: CheckOverlayParentRenderSnapshot | null = null;
let lastCreatingSnapshot: CheckOverlayParentRenderSnapshot | null = null;
let lastCommittedSnapshot: CheckOverlayParentRenderSnapshot | null = null;
const parentDecisionSigByRender = new Map<string, string>();
const stoppedRenderingKeys = new Set<string>();
const identityChangeKeys = new Set<string>();
const timelineEmittedKeys = new Set<string>();

let unmountTimelineAnchor: UnmountTimelineAnchor | null = null;
let goToBansHookTimelineAnchor: GoToBansTimelineAnchor | null = null;
let goToBansImportTimelineAnchor: GoToBansTimelineAnchor | null = null;

const emptyContext = (): CheckOverlayPayloadLifecycleContext => ({
  shellKind: null,
  renderBranch: null,
  returnBranch: null,
  activeKind: null,
  ownerDisplayKind: null,
  currentHeadKind: null,
  notificationOverlayVisible: null,
  queueClaimsNotificationScreen: null,
  activeNotificationChain: null,
  ownerQueueLen: 0,
  ownerQueueKinds: [],
  ownerQueueIds: [],
  ownerQueueKeys: [],
  ownerPendingLen: 0,
  ownerPendingKinds: [],
  ownerPendingIds: [],
  ownerPendingKeys: [],
  overlayQueueRefLen: 0,
  overlayQueueRefKinds: [],
  overlayQueueRefIds: [],
  overlayQueueRefKeys: [],
  overlayQueueStateLen: 0,
  overlayQueueStateKinds: [],
  overlayQueueStateIds: [],
  overlayQueueStateKeys: [],
});

function captureStack(label: string): string {
  try {
    return new Error(label).stack ?? '';
  } catch {
    return '';
  }
}

function isCheckShellContext(
  ctx: Pick<CheckOverlayPayloadLifecycleContext, 'shellKind' | 'renderBranch'>,
): boolean {
  return ctx.shellKind === 'check' || ctx.renderBranch === 'shell-check';
}

function payloadValid(snapshot: CheckOverlayParentRenderSnapshot): boolean {
  return Boolean(snapshot.checkBanId && snapshot.checkOverlayKey);
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

function mergeContext(
  patch?: Partial<CheckOverlayPayloadLifecycleContext>,
): CheckOverlayPayloadLifecycleContext {
  const base = hooks?.readContext() ?? emptyContext();
  return { ...base, ...patch };
}

export function buildCheckOverlayComponentIdentityToken(input: {
  path: string;
  checkOverlayKeyProp: string | null;
  contentOnly?: boolean;
  checkDirect?: boolean;
}): string {
  return [
    'CheckOverlay',
    `path=${input.path}`,
    `keyProp=${input.checkOverlayKeyProp ?? 'implicit'}`,
    `contentOnly=${Boolean(input.contentOnly)}`,
    `checkDirect=${Boolean(input.checkDirect)}`,
  ].join('|');
}

export function buildCheckOverlayParentIdentityToken(input: {
  parentComponent: string;
  parentMountId: string;
  checkOverlayKeyProp: string | null;
}): string {
  return [
    input.parentComponent,
    `mountId=${input.parentMountId}`,
    `keyProp=${input.checkOverlayKeyProp ?? 'none'}`,
  ].join('|');
}

export function buildCheckOverlayParentRenderSnapshot(input: {
  parentComponent: string;
  parentMountId: string;
  parentRenderBranch: string;
  returnBranch: string;
  shouldRenderCheckOverlay: boolean;
  checkOverlayElementCreated: boolean;
  actualCheckOverlayElementCreated?: boolean;
  checkOverlayKeyProp: string | null;
  checkBanId: string | null;
  contentOnly?: boolean;
  checkDirect?: boolean;
  contextPatch?: Partial<CheckOverlayPayloadLifecycleContext>;
}): CheckOverlayParentRenderSnapshot {
  const ctx = mergeContext(input.contextPatch);
  const checkBanId = input.checkBanId?.trim() || null;
  const checkOverlayKeyValue = checkBanId ? checkOverlayKey(checkBanId) : null;
  const componentIdentityToken = buildCheckOverlayComponentIdentityToken({
    path: input.parentComponent,
    checkOverlayKeyProp: input.checkOverlayKeyProp,
    contentOnly: input.contentOnly,
    checkDirect: input.checkDirect,
  });
  const parentIdentityToken = buildCheckOverlayParentIdentityToken({
    parentComponent: input.parentComponent,
    parentMountId: input.parentMountId,
    checkOverlayKeyProp: input.checkOverlayKeyProp,
  });
  return {
    ...ctx,
    parentComponent: input.parentComponent,
    parentRenderBranch: input.parentRenderBranch,
    returnBranch: input.returnBranch,
    shouldRenderCheckOverlay: input.shouldRenderCheckOverlay,
    checkOverlayElementCreated: input.checkOverlayElementCreated,
    actualCheckOverlayElementCreated:
      input.actualCheckOverlayElementCreated ??
      input.checkOverlayElementCreated,
    checkOverlayKeyProp: input.checkOverlayKeyProp,
    checkBanId,
    checkOverlayKey: checkOverlayKeyValue,
    componentTypeName: 'CheckOverlay',
    componentIdentityToken,
    parentIdentityToken,
  };
}

export function registerCheckOverlayParentRenderHooks(
  next: ParentRenderHooks | null,
): void {
  hooks = next;
}

export function observeCheckOverlayParentRenderDecision(
  input: CheckOverlayParentRenderDecisionInput,
): void {
  if (!isClientDiagTraceEnvironment()) return;
  if (!isCheckShellContext(input.snapshot)) return;

  const sig = [
    input.snapshot.parentComponent,
    input.snapshot.returnBranch,
    input.snapshot.shouldRenderCheckOverlay,
    input.snapshot.checkOverlayElementCreated,
    input.snapshot.checkOverlayKeyProp,
    input.snapshot.checkBanId,
    input.snapshot.componentIdentityToken,
    input.snapshot.parentIdentityToken,
    input.snapshot.shellKind,
    input.snapshot.renderBranch,
    input.reason,
  ].join('|');
  const renderKey = `${input.snapshot.parentComponent}|${input.snapshot.renderBranch}`;
  if (parentDecisionSigByRender.get(renderKey) === sig) return;
  parentDecisionSigByRender.set(renderKey, sig);

  emitClientDiagTrace('CHECK_OVERLAY_PARENT_RENDER_DECISION_TRACE', {
    timestamp: diagTraceNow(),
    source: input.source,
    reason: input.reason,
    calledFrom: input.calledFrom,
    stack: captureStack('CHECK_OVERLAY_PARENT_RENDER_DECISION_TRACE'),
    parentComponent: input.snapshot.parentComponent,
    parentRenderBranch: input.snapshot.parentRenderBranch,
    returnBranch: input.snapshot.returnBranch,
    shouldRenderCheckOverlay: input.snapshot.shouldRenderCheckOverlay,
    checkOverlayElementCreated: input.snapshot.checkOverlayElementCreated,
    actualCheckOverlayElementCreated:
      input.snapshot.actualCheckOverlayElementCreated,
    checkOverlayKeyProp: input.snapshot.checkOverlayKeyProp,
    checkBanId: input.snapshot.checkBanId,
    checkOverlayKey: input.snapshot.checkOverlayKey,
    componentTypeName: input.snapshot.componentTypeName,
    componentIdentityToken: input.snapshot.componentIdentityToken,
    parentIdentityToken: input.snapshot.parentIdentityToken,
    activeKind: input.snapshot.activeKind,
    ownerDisplayKind: input.snapshot.ownerDisplayKind,
    currentHeadKind: input.snapshot.currentHeadKind,
    shellKind: input.snapshot.shellKind,
    renderBranch: input.snapshot.renderBranch,
    notificationOverlayVisible: input.snapshot.notificationOverlayVisible,
    queueClaimsNotificationScreen: input.snapshot.queueClaimsNotificationScreen,
    activeNotificationChain: input.snapshot.activeNotificationChain,
    ownerQueueLen: input.snapshot.ownerQueueLen,
    ownerQueueKinds: input.snapshot.ownerQueueKinds,
    ownerQueueIds: input.snapshot.ownerQueueIds,
    ownerQueueKeys: input.snapshot.ownerQueueKeys,
    ownerPendingLen: input.snapshot.ownerPendingLen,
    ownerPendingKinds: input.snapshot.ownerPendingKinds,
    ownerPendingIds: input.snapshot.ownerPendingIds,
    ownerPendingKeys: input.snapshot.ownerPendingKeys,
    overlayQueueRefLen: input.snapshot.overlayQueueRefLen,
    overlayQueueRefKinds: input.snapshot.overlayQueueRefKinds,
    overlayQueueRefIds: input.snapshot.overlayQueueRefIds,
    overlayQueueRefKeys: input.snapshot.overlayQueueRefKeys,
    overlayQueueStateLen: input.snapshot.overlayQueueStateLen,
    overlayQueueStateKinds: input.snapshot.overlayQueueStateKinds,
    overlayQueueStateIds: input.snapshot.overlayQueueStateIds,
    overlayQueueStateKeys: input.snapshot.overlayQueueStateKeys,
  });
}

export function stageCheckOverlayParentRenderSnapshot(
  snapshot: CheckOverlayParentRenderSnapshot,
): void {
  pendingSnapshot = snapshot;
  observeCheckOverlayParentRenderDecision({
    source: 'check-overlay-parent-render',
    reason: 'parent-render-staged',
    calledFrom: 'stageCheckOverlayParentRenderSnapshot',
    snapshot,
  });
}

function resolveStopReason(
  previous: CheckOverlayParentRenderSnapshot,
  current: CheckOverlayParentRenderSnapshot,
): CheckOverlayParentStopReason {
  const prevShellCheck = isCheckShellContext(previous);
  const currentShellCheck = isCheckShellContext(current);

  if (prevShellCheck && !currentShellCheck) {
    return 'branch-changed';
  }
  if (
    previous.parentIdentityToken !== current.parentIdentityToken &&
    previous.parentComponent === current.parentComponent
  ) {
    return 'parent-remounted';
  }
  if (previous.parentIdentityToken !== current.parentIdentityToken) {
    return 'parent-remounted';
  }
  if (previous.checkOverlayKeyProp !== current.checkOverlayKeyProp) {
    return 'key-changed';
  }
  if (previous.componentIdentityToken !== current.componentIdentityToken) {
    return 'component-type-changed';
  }
  if (currentShellCheck && !current.shouldRenderCheckOverlay) {
    return 'should-render-false';
  }
  if (currentShellCheck && !current.actualCheckOverlayElementCreated) {
    if (
      current.returnBranch !== previous.returnBranch &&
      !current.returnBranch.includes('check')
    ) {
      return 'parent-returned-other-branch';
    }
    return 'element-not-created';
  }
  if (
    currentShellCheck &&
    current.returnBranch !== previous.returnBranch &&
    !current.actualCheckOverlayElementCreated
  ) {
    return 'parent-returned-other-branch';
  }
  return 'unknown';
}

function maybeEmitIdentityChange(
  previous: CheckOverlayParentRenderSnapshot,
  current: CheckOverlayParentRenderSnapshot,
  markers: ShellCheckActionMarkers,
): void {
  if (!isCheckShellContext(current) && !isCheckShellContext(previous)) return;

  const keyChanged =
    previous.checkOverlayKeyProp !== current.checkOverlayKeyProp;
  const componentChanged =
    previous.componentIdentityToken !== current.componentIdentityToken;
  const parentChanged =
    previous.parentIdentityToken !== current.parentIdentityToken;
  if (!keyChanged && !componentChanged && !parentChanged) return;

  const emitKey = [
    previous.checkBanId ?? 'no-ban',
    previous.checkOverlayKeyProp,
    current.checkOverlayKeyProp,
    previous.componentIdentityToken,
    current.componentIdentityToken,
    previous.parentIdentityToken,
    current.parentIdentityToken,
  ].join('|');
  if (identityChangeKeys.has(emitKey)) return;
  identityChangeKeys.add(emitKey);

  emitClientDiagTrace('CHECK_OVERLAY_IDENTITY_CHANGE_TRACE', {
    timestamp: diagTraceNow(),
    previousKey: previous.checkOverlayKeyProp,
    nextKey: current.checkOverlayKeyProp,
    previousComponentIdentity: previous.componentIdentityToken,
    nextComponentIdentity: current.componentIdentityToken,
    previousParentIdentity: previous.parentIdentityToken,
    nextParentIdentity: current.parentIdentityToken,
    shellKind: current.shellKind ?? previous.shellKind,
    renderBranch: current.renderBranch ?? previous.renderBranch,
    checkBanId: current.checkBanId ?? previous.checkBanId,
    checkOverlayKey: current.checkOverlayKey ?? previous.checkOverlayKey,
    expectedExitMarkers: markers,
  });
}

function maybeEmitStoppedRendering(
  previous: CheckOverlayParentRenderSnapshot,
  current: CheckOverlayParentRenderSnapshot,
  markers: ShellCheckActionMarkers,
): void {
  if (!previous.actualCheckOverlayElementCreated) return;
  if (!payloadValid(previous)) return;
  if (!isCheckShellContext(previous)) return;

  const stillShellCheck = isCheckShellContext(current);
  const stillCreating =
    current.actualCheckOverlayElementCreated && payloadValid(current);

  if (stillCreating) return;
  if (!stillShellCheck && !previous.actualCheckOverlayElementCreated) return;

  const stopKey = `${previous.checkBanId ?? 'no-ban'}|${previous.parentComponent}|${previous.returnBranch}`;
  if (stoppedRenderingKeys.has(stopKey)) return;
  stoppedRenderingKeys.add(stopKey);

  const stopReason = resolveStopReason(previous, current);
  const unexpected = stillShellCheck && !hasExpectedExitMarkers(markers);

  emitClientDiagTrace('CHECK_OVERLAY_PARENT_STOPPED_RENDERING_TRACE', {
    timestamp: diagTraceNow(),
    previousParentSnapshot: previous,
    currentParentSnapshot: current,
    stopReason,
    unexpected,
    expectedExitMarkers: markers,
    actualCheckOverlayElementCreated: current.actualCheckOverlayElementCreated,
    previousActualCheckOverlayElementCreated:
      previous.actualCheckOverlayElementCreated,
    ...buildCheckOverlayParentReturnBranchTimelineFields(),
  });
}

export function flushCheckOverlayParentRenderTraces(): void {
  if (!isClientDiagTraceEnvironment()) return;

  const current = pendingSnapshot ?? buildFallbackCurrentSnapshot();
  const markers = readShellCheckActionMarkers();

  if (current && lastCommittedSnapshot) {
    maybeEmitIdentityChange(lastCommittedSnapshot, current, markers);
  }

  const creatingBaseline = lastCreatingSnapshot ?? lastCommittedSnapshot;
  if (creatingBaseline && current) {
    if (
      creatingBaseline.actualCheckOverlayElementCreated &&
      payloadValid(creatingBaseline)
    ) {
      maybeEmitStoppedRendering(creatingBaseline, current, markers);
    }
  } else if (creatingBaseline && !pendingSnapshot) {
    const fallbackCurrent = buildFallbackCurrentSnapshot();
    if (
      fallbackCurrent &&
      creatingBaseline.actualCheckOverlayElementCreated &&
      payloadValid(creatingBaseline)
    ) {
      maybeEmitStoppedRendering(creatingBaseline, fallbackCurrent, markers);
    }
  }

  if (current?.actualCheckOverlayElementCreated && payloadValid(current)) {
    lastCreatingSnapshot = current;
  } else if (current && !isCheckShellContext(current)) {
    lastCreatingSnapshot = null;
  }

  if (current) {
    lastCommittedSnapshot = current;
  }
  pendingSnapshot = null;
  parentDecisionSigByRender.clear();
}

function isCheckGoToBansHandler(handlerName: string): boolean {
  return (
    handlerName === 'go-to-bans-next-card:check' ||
    handlerName.endsWith(':check')
  );
}

function maybeEmitGoToBansAfterCheckUnmountTimeline(): void {
  if (!unmountTimelineAnchor) return;
  if (!goToBansHookTimelineAnchor && !goToBansImportTimelineAnchor) return;

  const hookTs = goToBansHookTimelineAnchor?.timestamp ?? null;
  const importTs = goToBansImportTimelineAnchor?.timestamp ?? null;
  const timelineKey = [
    unmountTimelineAnchor.checkBanId ?? 'no-ban',
    unmountTimelineAnchor.timestamp,
    hookTs,
    importTs,
  ].join('|');
  if (timelineEmittedKeys.has(timelineKey)) return;
  timelineEmittedKeys.add(timelineKey);

  const unmountTimestamp = unmountTimelineAnchor.timestamp;
  const goToBansHookTimestamp = hookTs;
  const importRequestedTimestamp = importTs;
  const deltaUnmountToHookMs =
    hookTs != null ? hookTs - unmountTimestamp : null;
  const deltaHookToImportMs =
    hookTs != null && importTs != null ? importTs - hookTs : null;
  const parentReturnBranchTimeline =
    buildCheckOverlayParentReturnBranchTimelineFields();
  const deltaParentReturnBranchToUnmountMs =
    parentReturnBranchTimeline != null
      ? unmountTimestamp - parentReturnBranchTimeline.parentReturnBranchTimestamp
      : null;

  emitClientDiagTrace('GO_TO_BANS_AFTER_CHECK_UNMOUNT_TIMELINE_TRACE', {
    checkBanId: unmountTimelineAnchor.checkBanId,
    checkOverlayKey: unmountTimelineAnchor.checkOverlayKey,
    unmountTimestamp,
    goToBansHookTimestamp,
    importRequestedTimestamp,
    deltaUnmountToHookMs,
    deltaHookToImportMs,
    deltaParentReturnBranchToUnmountMs,
    ...parentReturnBranchTimeline,
    handlerName:
      goToBansHookTimelineAnchor?.handlerName ??
      goToBansImportTimelineAnchor?.handlerName ??
      null,
    source:
      goToBansHookTimelineAnchor?.source ??
      goToBansImportTimelineAnchor?.source ??
      unmountTimelineAnchor.source,
    calledFrom:
      goToBansHookTimelineAnchor?.calledFrom ??
      goToBansImportTimelineAnchor?.calledFrom ??
      unmountTimelineAnchor.calledFrom,
    stack: captureStack('GO_TO_BANS_AFTER_CHECK_UNMOUNT_TIMELINE_TRACE'),
  });
}

export function anchorCheckOverlayUnmountForGoToBansTimeline(input: {
  checkBanId: string | null;
  checkOverlayKey: string | null;
  source: string;
  calledFrom: string;
}): void {
  if (!isClientDiagTraceEnvironment()) return;
  unmountTimelineAnchor = {
    timestamp: diagTraceNow(),
    checkBanId: input.checkBanId,
    checkOverlayKey: input.checkOverlayKey,
    source: input.source,
    calledFrom: input.calledFrom,
    stack: captureStack('CHECK_OVERLAY_UNMOUNT_TIMELINE_ANCHOR'),
  };
  maybeEmitGoToBansAfterCheckUnmountTimeline();
}

export function noteGoToBansAfterCheckUnmountTimelineHookEnter(input: {
  handlerName: string;
  source: string;
  calledFrom: string;
  banId?: string | null;
  stack?: string;
}): void {
  if (!isClientDiagTraceEnvironment()) return;
  if (!isCheckGoToBansHandler(input.handlerName)) return;

  goToBansHookTimelineAnchor = {
    timestamp: diagTraceNow(),
    handlerName: input.handlerName,
    source: input.source,
    calledFrom: input.calledFrom,
    stack: input.stack ?? captureStack('GO_TO_BANS_HOOK_ENTER_TIMELINE'),
    banId: input.banId ?? null,
  };
  maybeEmitGoToBansAfterCheckUnmountTimeline();
}

export function noteGoToBansAfterCheckUnmountTimelineImportRequested(input: {
  handlerName: string;
  source: string;
  calledFrom: string;
  banId?: string | null;
  stack?: string;
}): void {
  if (!isClientDiagTraceEnvironment()) return;
  if (!isCheckGoToBansHandler(input.handlerName)) return;

  goToBansImportTimelineAnchor = {
    timestamp: diagTraceNow(),
    handlerName: input.handlerName,
    source: input.source,
    calledFrom: input.calledFrom,
    stack: input.stack ?? captureStack('GO_TO_BANS_IMPORT_REQUESTED_TIMELINE'),
    banId: input.banId ?? null,
  };
  maybeEmitGoToBansAfterCheckUnmountTimeline();
}
