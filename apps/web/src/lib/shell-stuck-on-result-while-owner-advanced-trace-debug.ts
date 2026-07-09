'use client';

import {
  overlayQueueKey,
  type QueuedOverlay,
} from '@/lib/overlay-queue';
import { queueHeadIdFrom } from '@/lib/queue-head-lifecycle-trace-debug';
import { resolveOwnerDisplayKindBanId } from '@/lib/display-commit-trace-debug';
import {
  diagTraceNow,
  emitClientDiagTrace,
  isClientDiagTraceEnvironment,
} from '@/lib/diag-trace-client';

export type ShellStuckOnResultWhileOwnerAdvancedTraceInput = {
  source: string;
  reason?: string | null;
  calledFrom?: string | null;
  shellKind: string | null;
  renderBranch?: string | null;
  returnBranch?: string | null;
  activeKind: string | null;
  activeBanId?: string | null;
  ownerDisplayKind: string | null;
  ownerDisplayBanId?: string | null;
  currentHeadKind: string | null;
  currentHeadId?: string | null;
  ownerQueue: QueuedOverlay[];
  overlayQueueRef?: QueuedOverlay[];
  overlayQueueState?: QueuedOverlay[];
  activeNotificationChain?: boolean | null;
  explicitDrainReason?: string | null;
  drainSessionId?: string | number | null;
  queueClaimsNotificationScreen?: boolean | null;
  notificationOverlayVisible?: boolean | null;
  visualQueueDimSessionLive?: boolean | null;
  sendFlowOpening?: boolean | null;
  resultBanId?: string | null;
  resultOverlayKey?: string | null;
  resultSource?: string | null;
  displayBanId?: string | null;
  displayOverlayKey?: string | null;
  displaySource?: string | null;
  queueShellRendersResultOverlay?: boolean | null;
  queueResultOverlayClaimed?: boolean | null;
  renderableResultShell?: boolean | null;
  effectiveShellKind?: string | null;
  notificationQueueShellKind?: string | null;
};

type ShellStuckHooks = {
  readEnrichment: () => Partial<ShellStuckOnResultWhileOwnerAdvancedTraceInput>;
};

let hooks: ShellStuckHooks | null = null;
let lastEmittedSig = '';

function queueKinds(queue: QueuedOverlay[]): string[] {
  return queue.map((item) => item.kind);
}

function queueIds(queue: QueuedOverlay[]): string[] {
  return queue
    .map((item) => queueHeadIdFrom(item))
    .filter((id): id is string => id != null);
}

function queueKeys(queue: QueuedOverlay[]): string[] {
  return queue.map((item) => overlayQueueKey(item));
}

function captureStack(): string {
  try {
    return (
      new Error('SHELL_STUCK_ON_RESULT_WHILE_OWNER_ADVANCED_TRACE').stack ?? ''
    );
  } catch {
    return '';
  }
}

function matchesStuckCondition(input: {
  shellKind: string | null;
  ownerDisplayKind: string | null;
  activeKind: string | null;
  currentHeadKind: string | null;
  ownerQueueLen: number;
  notificationOverlayVisible: boolean | null | undefined;
  queueClaimsNotificationScreen: boolean | null | undefined;
}): boolean {
  return (
    input.shellKind === 'result' &&
    input.ownerDisplayKind != null &&
    input.ownerDisplayKind !== 'result' &&
    input.activeKind !== 'result' &&
    input.currentHeadKind !== 'result' &&
    input.ownerQueueLen > 0 &&
    input.notificationOverlayVisible === true &&
    input.queueClaimsNotificationScreen === true
  );
}

export function registerShellStuckOnResultWhileOwnerAdvancedHooks(
  next: ShellStuckHooks | null,
): void {
  hooks = next;
}

export function traceShellStuckOnResultWhileOwnerAdvancedIfNeeded(
  input: ShellStuckOnResultWhileOwnerAdvancedTraceInput,
): void {
  if (!isClientDiagTraceEnvironment()) return;

  const enrichment = hooks?.readEnrichment() ?? {};
  const ownerQueue =
    input.ownerQueue.length > 0
      ? input.ownerQueue
      : (enrichment.ownerQueue ?? input.ownerQueue);
  const overlayQueueRef =
    input.overlayQueueRef ?? enrichment.overlayQueueRef ?? [];
  const overlayQueueState =
    input.overlayQueueState ?? enrichment.overlayQueueState ?? ownerQueue;
  const shellKind = input.shellKind ?? enrichment.shellKind ?? null;
  const ownerDisplayKind =
    input.ownerDisplayKind ?? enrichment.ownerDisplayKind ?? null;
  const activeKind = input.activeKind ?? enrichment.activeKind ?? null;
  const currentHeadKind =
    input.currentHeadKind ?? enrichment.currentHeadKind ?? null;
  const notificationOverlayVisible =
    input.notificationOverlayVisible ??
    enrichment.notificationOverlayVisible ??
    null;
  const queueClaimsNotificationScreen =
    input.queueClaimsNotificationScreen ??
    enrichment.queueClaimsNotificationScreen ??
    null;

  if (
    !matchesStuckCondition({
      shellKind,
      ownerDisplayKind,
      activeKind,
      currentHeadKind,
      ownerQueueLen: ownerQueue.length,
      notificationOverlayVisible,
      queueClaimsNotificationScreen,
    })
  ) {
    return;
  }

  const queueIdsList = queueIds(ownerQueue);
  const sig = [
    shellKind,
    ownerDisplayKind,
    activeKind,
    currentHeadKind,
    queueIdsList.join(','),
  ].join('|');
  if (sig === lastEmittedSig) return;
  lastEmittedSig = sig;

  const displayBanId =
    input.displayBanId ??
    input.ownerDisplayBanId ??
    enrichment.displayBanId ??
    enrichment.ownerDisplayBanId ??
    null;
  const resultBanId = input.resultBanId ?? enrichment.resultBanId ?? null;
  const head = ownerQueue[0] ?? null;

  const payload = {
    timestamp: diagTraceNow(),
    source: input.source,
    reason:
      input.reason ??
      'shell-stuck-on-result-while-owner-advanced',
    calledFrom: input.calledFrom ?? input.source,
    stack: captureStack(),
    shellKind,
    renderBranch: input.renderBranch ?? enrichment.renderBranch ?? null,
    returnBranch: input.returnBranch ?? enrichment.returnBranch ?? null,
    activeKind,
    activeBanId: input.activeBanId ?? enrichment.activeBanId ?? null,
    ownerDisplayKind,
    ownerDisplayBanId: input.ownerDisplayBanId ?? displayBanId,
    currentHeadKind,
    currentHeadId:
      input.currentHeadId ??
      enrichment.currentHeadId ??
      (head ? queueHeadIdFrom(head) : null),
    queueLen: ownerQueue.length,
    queueKinds: queueKinds(ownerQueue),
    queueIds: queueIdsList,
    queueKeys: queueKeys(ownerQueue),
    refLen: overlayQueueRef.length,
    refKinds: queueKinds(overlayQueueRef),
    refIds: queueIds(overlayQueueRef),
    refKeys: queueKeys(overlayQueueRef),
    stateLen: overlayQueueState.length,
    stateKinds: queueKinds(overlayQueueState),
    stateIds: queueIds(overlayQueueState),
    stateKeys: queueKeys(overlayQueueState),
    activeNotificationChain:
      input.activeNotificationChain ??
      enrichment.activeNotificationChain ??
      null,
    explicitDrainReason:
      input.explicitDrainReason ?? enrichment.explicitDrainReason ?? null,
    drainSessionId: input.drainSessionId ?? enrichment.drainSessionId ?? null,
    queueClaimsNotificationScreen,
    notificationOverlayVisible,
    visualQueueDimSessionLive:
      input.visualQueueDimSessionLive ??
      enrichment.visualQueueDimSessionLive ??
      null,
    sendFlowOpening: input.sendFlowOpening ?? enrichment.sendFlowOpening ?? null,
    resultBanId,
    resultOverlayKey:
      input.resultOverlayKey ??
      enrichment.resultOverlayKey ??
      (resultBanId ? `result:${resultBanId}` : null),
    resultSource: input.resultSource ?? enrichment.resultSource ?? null,
    displayBanId,
    displayOverlayKey:
      input.displayOverlayKey ??
      enrichment.displayOverlayKey ??
      (ownerDisplayKind && displayBanId
        ? `${ownerDisplayKind}:${displayBanId}`
        : null),
    displaySource: input.displaySource ?? enrichment.displaySource ?? null,
    queueShellRendersResultOverlay:
      input.queueShellRendersResultOverlay ??
      enrichment.queueShellRendersResultOverlay ??
      null,
    queueResultOverlayClaimed:
      input.queueResultOverlayClaimed ??
      enrichment.queueResultOverlayClaimed ??
      null,
    renderableResultShell:
      input.renderableResultShell ?? enrichment.renderableResultShell ?? null,
    effectiveShellKind:
      input.effectiveShellKind ?? enrichment.effectiveShellKind ?? null,
    notificationQueueShellKind:
      input.notificationQueueShellKind ??
      enrichment.notificationQueueShellKind ??
      null,
  };

  emitClientDiagTrace(
    'SHELL_STUCK_ON_RESULT_WHILE_OWNER_ADVANCED_TRACE',
    payload,
  );
}

export function buildShellStuckOwnerDisplayFields(owner: {
  queue: QueuedOverlay[];
  active: { kind: string | null; banId: string | null; overlayKey?: string | null };
  display: {
    result?: { id: string } | null;
    incomingBan?: { id: string } | null;
    checkBan?: { id: string } | null;
  };
}): Pick<
  ShellStuckOnResultWhileOwnerAdvancedTraceInput,
  | 'ownerQueue'
  | 'activeKind'
  | 'activeBanId'
  | 'ownerDisplayKind'
  | 'ownerDisplayBanId'
  | 'currentHeadKind'
  | 'currentHeadId'
  | 'displayBanId'
  | 'displayOverlayKey'
> {
  const head = owner.queue[0] ?? null;
  const display = resolveOwnerDisplayKindBanId(owner.display);
  return {
    ownerQueue: owner.queue,
    activeKind: owner.active.kind,
    activeBanId: owner.active.banId,
    ownerDisplayKind: display.displayKind,
    ownerDisplayBanId: display.displayBanId,
    currentHeadKind: head?.kind ?? owner.active.kind,
    currentHeadId: head ? queueHeadIdFrom(head) : owner.active.banId,
    displayBanId: display.displayBanId,
    displayOverlayKey:
      display.displayKind && display.displayBanId
        ? `${display.displayKind}:${display.displayBanId}`
        : owner.active.overlayKey ?? null,
  };
}
