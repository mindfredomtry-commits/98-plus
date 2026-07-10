'use client';

import type { BanInteraction } from '@98plus/shared';
import { getCheckModalView } from '@98plus/shared';
import {
  checkOverlayKey,
  overlayQueueKey,
  type QueuedOverlay,
} from '@/lib/overlay-queue';
import { queueHeadIdFrom } from '@/lib/queue-head-lifecycle-trace-debug';
import {
  readShellCheckActionMarkers,
  type ShellCheckActionMarkers,
} from '@/lib/shell-check-lifecycle-trace-debug';
import {
  diagTraceNow,
  emitClientDiagTrace,
  isClientDiagTraceEnvironment,
} from '@/lib/diag-trace-client';

export type CheckOverlayPayloadLifecycleEvent =
  | 'mount'
  | 'render-valid'
  | 'render-null'
  | 'payload-changed'
  | 'payload-lost'
  | 'unmount'
  | 'props-kind-mismatch'
  | 'shell-check-without-payload';

export type CheckOverlayUnexpectedDisappearType =
  | 'payload-null'
  | 'check-ban-null'
  | 'overlay-key-lost'
  | 'returned-null'
  | 'unmounted'
  | 'props-kind-mismatch';

export type CheckOverlayPayloadLifecycleContext = {
  shellKind: string | null;
  renderBranch: string | null;
  returnBranch: string | null;
  activeKind: string | null;
  ownerDisplayKind: string | null;
  currentHeadKind: string | null;
  notificationOverlayVisible: boolean | null;
  queueClaimsNotificationScreen: boolean | null;
  activeNotificationChain: boolean | null;
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

export type CheckOverlayPayloadLifecycleInput = {
  event: CheckOverlayPayloadLifecycleEvent;
  source: string;
  reason: string;
  calledFrom: string;
  checkBan?: BanInteraction | null;
  visible?: boolean | null;
  mounted?: boolean | null;
  rendered?: boolean | null;
  returnedNull?: boolean | null;
  payloadSource?: string | null;
  payloadVersion?: string | number | null;
  propsKind?: string | null;
  userId?: string | null;
  contextPatch?: Partial<CheckOverlayPayloadLifecycleContext>;
};

type CheckOverlayPayloadLifecycleHooks = {
  readContext: () => CheckOverlayPayloadLifecycleContext;
};

type PayloadAssessment = {
  checkBanId: string | null;
  checkOverlayKey: string | null;
  previousCheckBanId: string | null;
  previousCheckOverlayKey: string | null;
  hasCheckPayload: boolean;
  hasCheckBan: boolean;
  hasCheckUser: boolean;
  hasCheckText: boolean;
  payloadIsValidNow: boolean;
  payloadWasValidBefore: boolean;
  payloadObjectKeys: string[];
};

type StoredValidSnapshot = CheckOverlayPayloadLifecycleContext &
  PayloadAssessment & {
    timestamp: number;
    visible: boolean | null;
    mounted: boolean | null;
    rendered: boolean | null;
    payloadSource: string | null;
    actionMarkers: ShellCheckActionMarkers;
  };

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

let hooks: CheckOverlayPayloadLifecycleHooks | null = null;
let previousCheckBanId: string | null = null;
let previousCheckOverlayKey: string | null = null;
let payloadWasValidBefore = false;
let sawValidRender = false;
let armedForUnexpected = false;
let lastValidSnapshot: StoredValidSnapshot | null = null;
const lifecycleSigByEvent = new Map<string, string>();
const emittedUnexpectedKeys = new Set<string>();

function captureLifecycleStack(): string {
  try {
    return new Error('CHECK_OVERLAY_PAYLOAD_LIFECYCLE_TRACE').stack ?? '';
  } catch {
    return '';
  }
}

function captureUnexpectedStack(): string {
  try {
    return new Error('CHECK_OVERLAY_UNEXPECTED_DISAPPEAR_TRACE').stack ?? '';
  } catch {
    return '';
  }
}

function isCheckShellContext(ctx: CheckOverlayPayloadLifecycleContext): boolean {
  return (
    ctx.shellKind === 'check' ||
    ctx.renderBranch === 'shell-check' ||
    ctx.ownerDisplayKind === 'check'
  );
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

function assessPayload(
  checkBan: BanInteraction | null | undefined,
  userId?: string | null,
): PayloadAssessment {
  const prevBanId = previousCheckBanId;
  const prevOverlayKey = previousCheckOverlayKey;
  const wasValidBefore = payloadWasValidBefore;
  const checkBanId = checkBan?.id?.trim() || null;
  const checkOverlayKeyValue = checkBanId ? checkOverlayKey(checkBanId) : null;
  const modalView = checkBan
    ? getCheckModalView(checkBan, userId ?? null)
    : null;
  const hasCheckPayload = checkBan != null;
  const hasCheckBan = checkBanId != null;
  const hasCheckUser = Boolean(
    checkBan?.sender?.id?.trim() || checkBan?.receiver?.id?.trim(),
  );
  const hasCheckText = Boolean(checkBan?.text?.trim());
  const payloadIsValidNow =
    hasCheckPayload && hasCheckBan && modalView != null && hasCheckText;
  const assessment: PayloadAssessment = {
    checkBanId,
    checkOverlayKey: checkOverlayKeyValue,
    previousCheckBanId: prevBanId,
    previousCheckOverlayKey: prevOverlayKey,
    hasCheckPayload,
    hasCheckBan,
    hasCheckUser,
    hasCheckText,
    payloadIsValidNow,
    payloadWasValidBefore: wasValidBefore,
    payloadObjectKeys: checkBan ? Object.keys(checkBan) : [],
  };
  previousCheckBanId = checkBanId;
  previousCheckOverlayKey = checkOverlayKeyValue;
  payloadWasValidBefore = payloadIsValidNow;
  return assessment;
}

function mergeContext(
  patch?: Partial<CheckOverlayPayloadLifecycleContext>,
): CheckOverlayPayloadLifecycleContext {
  const base = hooks?.readContext() ?? emptyContext();
  return { ...base, ...patch };
}

function buildLifecyclePayload(
  input: CheckOverlayPayloadLifecycleInput,
  assessment: PayloadAssessment,
  ctx: CheckOverlayPayloadLifecycleContext,
  markers: ShellCheckActionMarkers,
) {
  return {
    timestamp: diagTraceNow(),
    event: input.event,
    source: input.source,
    reason: input.reason,
    calledFrom: input.calledFrom,
    stack: captureLifecycleStack(),
    checkBanId: assessment.checkBanId,
    checkOverlayKey: assessment.checkOverlayKey,
    previousCheckBanId: assessment.previousCheckBanId,
    previousCheckOverlayKey: assessment.previousCheckOverlayKey,
    hasCheckPayload: assessment.hasCheckPayload,
    hasCheckBan: assessment.hasCheckBan,
    hasCheckUser: assessment.hasCheckUser,
    hasCheckText: assessment.hasCheckText,
    payloadSource: input.payloadSource ?? null,
    payloadVersion: input.payloadVersion ?? null,
    payloadObjectKeys: assessment.payloadObjectKeys,
    payloadWasValidBefore: assessment.payloadWasValidBefore,
    payloadIsValidNow: assessment.payloadIsValidNow,
    mounted: input.mounted ?? null,
    rendered: input.rendered ?? null,
    returnedNull: input.returnedNull ?? null,
    shellKind: ctx.shellKind,
    renderBranch: ctx.renderBranch,
    returnBranch: ctx.returnBranch,
    activeKind: ctx.activeKind,
    ownerDisplayKind: ctx.ownerDisplayKind,
    currentHeadKind: ctx.currentHeadKind,
    notificationOverlayVisible: ctx.notificationOverlayVisible,
    queueClaimsNotificationScreen: ctx.queueClaimsNotificationScreen,
    activeNotificationChain: ctx.activeNotificationChain,
    ownerQueueLen: ctx.ownerQueueLen,
    ownerQueueKinds: ctx.ownerQueueKinds,
    ownerQueueIds: ctx.ownerQueueIds,
    ownerQueueKeys: ctx.ownerQueueKeys,
    ownerPendingLen: ctx.ownerPendingLen,
    ownerPendingKinds: ctx.ownerPendingKinds,
    ownerPendingIds: ctx.ownerPendingIds,
    ownerPendingKeys: ctx.ownerPendingKeys,
    overlayQueueRefLen: ctx.overlayQueueRefLen,
    overlayQueueRefKinds: ctx.overlayQueueRefKinds,
    overlayQueueRefIds: ctx.overlayQueueRefIds,
    overlayQueueRefKeys: ctx.overlayQueueRefKeys,
    overlayQueueStateLen: ctx.overlayQueueStateLen,
    overlayQueueStateKinds: ctx.overlayQueueStateKinds,
    overlayQueueStateIds: ctx.overlayQueueStateIds,
    overlayQueueStateKeys: ctx.overlayQueueStateKeys,
    userPressedCheckYes: markers.userPressedCheckYes,
    userPressedCheckNo: markers.userPressedCheckNo,
    submitCheckAnswerStarted: markers.submitCheckAnswerStarted,
    submitCheckAnswerFinished: markers.submitCheckAnswerFinished,
    checkDismissStarted: markers.checkDismissStarted,
    checkConsumed: markers.checkConsumed,
    resultArrivedAfterCheck: markers.resultArrivedAfterCheck,
    visible: input.visible ?? null,
    propsKind: input.propsKind ?? null,
  };
}

function maybeArmUnexpectedWatch(
  ctx: CheckOverlayPayloadLifecycleContext,
  assessment: PayloadAssessment,
  input: CheckOverlayPayloadLifecycleInput,
  markers: ShellCheckActionMarkers,
): void {
  if (!isCheckShellContext(ctx)) return;
  if (!assessment.payloadIsValidNow) return;
  if (ctx.notificationOverlayVisible !== true) return;
  if (ctx.activeNotificationChain !== true) return;
  sawValidRender = true;
  armedForUnexpected = true;
  lastValidSnapshot = {
    ...ctx,
    ...assessment,
    timestamp: diagTraceNow(),
    visible: input.visible ?? null,
    mounted: input.mounted ?? null,
    rendered: input.rendered ?? null,
    payloadSource: input.payloadSource ?? null,
    actionMarkers: { ...markers },
  };
}

function resolveDisappearType(
  input: CheckOverlayPayloadLifecycleInput,
  assessment: PayloadAssessment,
): CheckOverlayUnexpectedDisappearType | null {
  if (input.event === 'props-kind-mismatch') return 'props-kind-mismatch';
  if (input.event === 'unmount') return 'unmounted';
  if (input.returnedNull === true || input.event === 'render-null') {
    return 'returned-null';
  }
  if (
    assessment.previousCheckOverlayKey &&
    !assessment.checkOverlayKey
  ) {
    return 'overlay-key-lost';
  }
  if (assessment.payloadWasValidBefore && !assessment.hasCheckPayload) {
    return 'payload-null';
  }
  if (assessment.payloadWasValidBefore && !assessment.hasCheckBan) {
    return 'check-ban-null';
  }
  if (input.rendered === false) return 'returned-null';
  return null;
}

function maybeEmitUnexpectedDisappear(
  input: CheckOverlayPayloadLifecycleInput,
  assessment: PayloadAssessment,
  ctx: CheckOverlayPayloadLifecycleContext,
  markers: ShellCheckActionMarkers,
): void {
  if (!armedForUnexpected && !sawValidRender) return;
  if (!lastValidSnapshot) return;

  const disappearType = resolveDisappearType(input, assessment);
  if (!disappearType) return;

  const shellStillCheck =
    ctx.shellKind === 'check' || ctx.renderBranch === 'shell-check';
  if (!shellStillCheck) return;

  const unexpected = !hasExpectedExitMarkers(markers);
  if (!unexpected) return;

  const key = `${lastValidSnapshot.checkBanId ?? 'no-check'}|${disappearType}`;
  if (emittedUnexpectedKeys.has(key)) return;
  emittedUnexpectedKeys.add(key);

  const snapshotAfter = buildLifecyclePayload(
    input,
    assessment,
    ctx,
    markers,
  );

  emitClientDiagTrace('CHECK_OVERLAY_UNEXPECTED_DISAPPEAR_TRACE', {
    timestamp: diagTraceNow(),
    source: input.source,
    reason: input.reason,
    calledFrom: input.calledFrom,
    stack: captureUnexpectedStack(),
    disappearType,
    unexpected: true,
    expectedExitMarkers: markers,
    snapshotBefore: lastValidSnapshot,
    snapshotAfter,
    checkBanId: assessment.checkBanId,
    checkOverlayKey: assessment.checkOverlayKey,
    previousCheckBanId: assessment.previousCheckBanId,
    previousCheckOverlayKey: assessment.previousCheckOverlayKey,
  });
}

export function registerCheckOverlayPayloadLifecycleHooks(
  next: CheckOverlayPayloadLifecycleHooks | null,
): void {
  hooks = next;
}

export function buildCheckOverlayPayloadQueueFields(input: {
  ownerQueue: QueuedOverlay[];
  ownerPending?: QueuedOverlay[];
  overlayQueueRef?: QueuedOverlay[];
  overlayQueueState?: QueuedOverlay[];
}): Pick<
  CheckOverlayPayloadLifecycleContext,
  | 'ownerQueueLen'
  | 'ownerQueueKinds'
  | 'ownerQueueIds'
  | 'ownerQueueKeys'
  | 'ownerPendingLen'
  | 'ownerPendingKinds'
  | 'ownerPendingIds'
  | 'ownerPendingKeys'
  | 'overlayQueueRefLen'
  | 'overlayQueueRefKinds'
  | 'overlayQueueRefIds'
  | 'overlayQueueRefKeys'
  | 'overlayQueueStateLen'
  | 'overlayQueueStateKinds'
  | 'overlayQueueStateIds'
  | 'overlayQueueStateKeys'
> {
  const ownerPending = input.ownerPending ?? [];
  const overlayQueueRef = input.overlayQueueRef ?? [];
  const overlayQueueState = input.overlayQueueState ?? [];
  const queueKinds = (queue: QueuedOverlay[]) => queue.map((item) => item.kind);
  const queueIds = (queue: QueuedOverlay[]) =>
    queue
      .map((item) => queueHeadIdFrom(item))
      .filter((id): id is string => id != null);
  const queueKeys = (queue: QueuedOverlay[]) =>
    queue.map((item) => overlayQueueKey(item));
  return {
    ownerQueueLen: input.ownerQueue.length,
    ownerQueueKinds: queueKinds(input.ownerQueue),
    ownerQueueIds: queueIds(input.ownerQueue),
    ownerQueueKeys: queueKeys(input.ownerQueue),
    ownerPendingLen: ownerPending.length,
    ownerPendingKinds: queueKinds(ownerPending),
    ownerPendingIds: queueIds(ownerPending),
    ownerPendingKeys: queueKeys(ownerPending),
    overlayQueueRefLen: overlayQueueRef.length,
    overlayQueueRefKinds: queueKinds(overlayQueueRef),
    overlayQueueRefIds: queueIds(overlayQueueRef),
    overlayQueueRefKeys: queueKeys(overlayQueueRef),
    overlayQueueStateLen: overlayQueueState.length,
    overlayQueueStateKinds: queueKinds(overlayQueueState),
    overlayQueueStateIds: queueIds(overlayQueueState),
    overlayQueueStateKeys: queueKeys(overlayQueueState),
  };
}

export function observeCheckOverlayPayloadLifecycle(
  input: CheckOverlayPayloadLifecycleInput,
): void {
  if (!isClientDiagTraceEnvironment()) return;

  const ctx = mergeContext(input.contextPatch);
  const markers = readShellCheckActionMarkers();
  const assessment = assessPayload(input.checkBan, input.userId);

  const lifecycleSig = [
    input.event,
    assessment.checkBanId,
    assessment.checkOverlayKey,
    input.visible,
    assessment.payloadIsValidNow,
    input.returnedNull,
    input.mounted,
    input.rendered,
    ctx.renderBranch,
    ctx.shellKind,
    input.reason,
  ].join('|');
  const prevSig = lifecycleSigByEvent.get(input.event);
  if (prevSig === lifecycleSig) return;
  lifecycleSigByEvent.set(input.event, lifecycleSig);

  if (input.event === 'render-valid' || input.event === 'mount') {
    maybeArmUnexpectedWatch(ctx, assessment, input, markers);
  }

  const payload = buildLifecyclePayload(input, assessment, ctx, markers);
  emitClientDiagTrace('CHECK_OVERLAY_PAYLOAD_LIFECYCLE_TRACE', payload);

  if (
    input.event === 'render-null' ||
    input.event === 'unmount' ||
    input.event === 'payload-lost' ||
    input.event === 'props-kind-mismatch' ||
    (input.event === 'payload-changed' && !assessment.payloadIsValidNow)
  ) {
    maybeEmitUnexpectedDisappear(input, assessment, ctx, markers);
  }
}

export function noteCheckOverlayPayloadPropsBuilt(input: {
  source: string;
  reason: string;
  calledFrom: string;
  checkBan: BanInteraction | null;
  visible: boolean;
  payloadSource: string;
  propsKind?: string | null;
  contextPatch?: Partial<CheckOverlayPayloadLifecycleContext>;
}): void {
  const event: CheckOverlayPayloadLifecycleEvent = input.checkBan?.id
    ? 'payload-changed'
    : 'shell-check-without-payload';
  observeCheckOverlayPayloadLifecycle({
    event,
    source: input.source,
    reason: input.reason,
    calledFrom: input.calledFrom,
    checkBan: input.checkBan,
    visible: input.visible,
    payloadSource: input.payloadSource,
    propsKind: input.propsKind ?? null,
    contextPatch: input.contextPatch,
  });
}
