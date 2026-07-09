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

export type QueueResultOverlayClaimArms = {
  claimFromQueueHead: boolean;
  claimFromActiveKind: boolean;
  claimFromEffectiveShellKind: boolean;
};

export type QueueResultOverlayClaimWriteTraceInput = {
  prevClaim: boolean | null;
  nextClaim: boolean;
  source: string;
  reason?: string | null;
  calledFrom?: string | null;
  claimArms?: Partial<QueueResultOverlayClaimArms> | null;
  prevClaimArms?: Partial<QueueResultOverlayClaimArms> | null;
  queueHeadKind?: string | null;
  activeKind?: string | null;
  effectiveShellKind?: string | null;
  ownerDisplayKind?: string | null;
  currentHeadKind?: string | null;
  queueKinds?: string[];
  queueIds?: string[];
  queueShellRendersResultOverlay?: boolean | null;
  shellKind?: string | null;
  renderBranch?: string | null;
  resultBanId?: string | null;
  activeNotificationChain?: boolean | null;
  notificationOverlayVisible?: boolean | null;
  visualQueueDimSessionLive?: boolean | null;
  queueClaimsNotificationScreen?: boolean | null;
};

export type QueueResultOverlayClaimStuckTraceInput = {
  source: string;
  reason?: string | null;
  calledFrom?: string | null;
  queueResultOverlayClaimed: boolean;
  queueShellRendersResultOverlay?: boolean | null;
  shellKind?: string | null;
  renderBranch?: string | null;
  activeKind?: string | null;
  ownerDisplayKind?: string | null;
  currentHeadKind?: string | null;
  effectiveShellKind?: string | null;
  resultBanId?: string | null;
  resultOverlayKey?: string | null;
  ownerQueue: QueuedOverlay[];
  overlayQueueRef?: QueuedOverlay[];
  overlayQueueState?: QueuedOverlay[];
  claimArms?: Partial<QueueResultOverlayClaimArms> | null;
  activeNotificationChain?: boolean | null;
  explicitDrainReason?: string | null;
  drainSessionId?: string | number | null;
  queueClaimsNotificationScreen?: boolean | null;
  notificationOverlayVisible?: boolean | null;
  visualQueueDimSessionLive?: boolean | null;
};

type ClaimHooks = {
  readEnrichment: () => Partial<
    QueueResultOverlayClaimWriteTraceInput &
      QueueResultOverlayClaimStuckTraceInput
  >;
};

let hooks: ClaimHooks | null = null;
let lastWriteSig = '';
let lastWriteAt = 0;
let lastStuckSig = '';
let prevClaimValue: boolean | null = null;
let prevClaimArms: QueueResultOverlayClaimArms | null = null;

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

function captureWriteStack(): string {
  try {
    return new Error('QUEUE_RESULT_OVERLAY_CLAIM_WRITE_TRACE').stack ?? '';
  } catch {
    return '';
  }
}

function captureStuckStack(): string {
  try {
    return new Error('QUEUE_RESULT_OVERLAY_CLAIM_STUCK_TRACE').stack ?? '';
  } catch {
    return '';
  }
}

function resolveClaimArms(input: {
  queueHeadKind?: string | null;
  activeKind?: string | null;
  effectiveShellKind?: string | null;
  claimArms?: Partial<QueueResultOverlayClaimArms> | null;
}): QueueResultOverlayClaimArms {
  return {
    claimFromQueueHead:
      input.claimArms?.claimFromQueueHead ??
      input.queueHeadKind === 'result',
    claimFromActiveKind:
      input.claimArms?.claimFromActiveKind ??
      input.activeKind === 'result',
    claimFromEffectiveShellKind:
      input.claimArms?.claimFromEffectiveShellKind ??
      input.effectiveShellKind === 'result',
  };
}

function winningClaimArms(arms: QueueResultOverlayClaimArms): string[] {
  return (Object.keys(arms) as Array<keyof QueueResultOverlayClaimArms>).filter(
    (key) => arms[key],
  );
}

export function registerQueueResultOverlayClaimTraceHooks(
  next: ClaimHooks | null,
): void {
  hooks = next;
}

export function resolveQueueResultOverlayClaimed(input: {
  queueHeadKind: string | null;
  activeKind: string | null;
  effectiveShellKind: string | null;
}): { claimed: boolean; arms: QueueResultOverlayClaimArms } {
  const arms: QueueResultOverlayClaimArms = {
    claimFromQueueHead: input.queueHeadKind === 'result',
    claimFromActiveKind: input.activeKind === 'result',
    claimFromEffectiveShellKind: input.effectiveShellKind === 'result',
  };
  return {
    claimed:
      arms.claimFromQueueHead ||
      arms.claimFromActiveKind ||
      arms.claimFromEffectiveShellKind,
    arms,
  };
}

/**
 * Derived claim has no setState — treat each observed prev→next change as a write.
 */
export function logQueueResultOverlayClaimWriteTrace(
  input: QueueResultOverlayClaimWriteTraceInput,
): void {
  if (!isClientDiagTraceEnvironment()) return;

  const enrichment = hooks?.readEnrichment() ?? {};
  const now = diagTraceNow();
  const nextArms = resolveClaimArms({
    queueHeadKind: input.queueHeadKind ?? enrichment.queueHeadKind ?? null,
    activeKind: input.activeKind ?? enrichment.activeKind ?? null,
    effectiveShellKind:
      input.effectiveShellKind ?? enrichment.effectiveShellKind ?? null,
    claimArms: input.claimArms,
  });
  const prevArms = input.prevClaimArms
    ? resolveClaimArms({ claimArms: input.prevClaimArms })
    : prevClaimArms;
  const armsChanged =
    !!prevArms &&
    (prevArms.claimFromQueueHead !== nextArms.claimFromQueueHead ||
      prevArms.claimFromActiveKind !== nextArms.claimFromActiveKind ||
      prevArms.claimFromEffectiveShellKind !==
        nextArms.claimFromEffectiveShellKind);
  if (input.prevClaim === input.nextClaim && !armsChanged) return;

  const payload = {
    timestamp: now,
    prevClaim: input.prevClaim,
    nextClaim: input.nextClaim,
    source: input.source,
    reason:
      input.reason ??
      `claim:${input.prevClaim ?? 'null'}->${input.nextClaim}`,
    calledFrom: input.calledFrom ?? input.source,
    stack: captureWriteStack(),
    claimFromQueueHead: nextArms.claimFromQueueHead,
    claimFromActiveKind: nextArms.claimFromActiveKind,
    claimFromEffectiveShellKind: nextArms.claimFromEffectiveShellKind,
    winningClaimArms: winningClaimArms(nextArms),
    prevClaimFromQueueHead: prevArms?.claimFromQueueHead ?? null,
    prevClaimFromActiveKind: prevArms?.claimFromActiveKind ?? null,
    prevClaimFromEffectiveShellKind:
      prevArms?.claimFromEffectiveShellKind ?? null,
    prevWinningClaimArms: prevArms ? winningClaimArms(prevArms) : [],
    queueHeadKind: input.queueHeadKind ?? enrichment.queueHeadKind ?? null,
    activeKind: input.activeKind ?? enrichment.activeKind ?? null,
    effectiveShellKind:
      input.effectiveShellKind ?? enrichment.effectiveShellKind ?? null,
    ownerDisplayKind:
      input.ownerDisplayKind ?? enrichment.ownerDisplayKind ?? null,
    currentHeadKind:
      input.currentHeadKind ?? enrichment.currentHeadKind ?? null,
    queueKinds: input.queueKinds ?? enrichment.queueKinds ?? [],
    queueIds: input.queueIds ?? enrichment.queueIds ?? [],
    queueShellRendersResultOverlay:
      input.queueShellRendersResultOverlay ??
      enrichment.queueShellRendersResultOverlay ??
      null,
    shellKind: input.shellKind ?? enrichment.shellKind ?? null,
    renderBranch: input.renderBranch ?? enrichment.renderBranch ?? null,
    resultBanId: input.resultBanId ?? enrichment.resultBanId ?? null,
    activeNotificationChain:
      input.activeNotificationChain ??
      enrichment.activeNotificationChain ??
      null,
    notificationOverlayVisible:
      input.notificationOverlayVisible ??
      enrichment.notificationOverlayVisible ??
      null,
    visualQueueDimSessionLive:
      input.visualQueueDimSessionLive ??
      enrichment.visualQueueDimSessionLive ??
      null,
    queueClaimsNotificationScreen:
      input.queueClaimsNotificationScreen ??
      enrichment.queueClaimsNotificationScreen ??
      null,
  };

  const sig = [
    payload.prevClaim,
    payload.nextClaim,
    payload.source,
    payload.winningClaimArms.join(','),
    payload.queueKinds.join(','),
  ].join('|');
  if (sig === lastWriteSig && now - lastWriteAt < 16) return;
  lastWriteSig = sig;
  lastWriteAt = now;

  emitClientDiagTrace('QUEUE_RESULT_OVERLAY_CLAIM_WRITE_TRACE', payload);
}

export function observeQueueResultOverlayClaimDerived(input: {
  nextClaim: boolean;
  claimArms: QueueResultOverlayClaimArms;
  source: string;
  reason?: string | null;
  calledFrom?: string | null;
  queueHeadKind?: string | null;
  activeKind?: string | null;
  effectiveShellKind?: string | null;
  ownerDisplayKind?: string | null;
  currentHeadKind?: string | null;
  queueKinds?: string[];
  queueIds?: string[];
  queueShellRendersResultOverlay?: boolean | null;
  shellKind?: string | null;
  renderBranch?: string | null;
  resultBanId?: string | null;
  activeNotificationChain?: boolean | null;
  notificationOverlayVisible?: boolean | null;
  visualQueueDimSessionLive?: boolean | null;
  queueClaimsNotificationScreen?: boolean | null;
}): void {
  if (!isClientDiagTraceEnvironment()) return;

  const prevClaim = prevClaimValue;
  const prevArms = prevClaimArms;
  if (prevClaim !== input.nextClaim) {
    logQueueResultOverlayClaimWriteTrace({
      prevClaim,
      nextClaim: input.nextClaim,
      source: input.source,
      reason: input.reason,
      calledFrom: input.calledFrom,
      claimArms: input.claimArms,
      prevClaimArms: prevArms,
      queueHeadKind: input.queueHeadKind,
      activeKind: input.activeKind,
      effectiveShellKind: input.effectiveShellKind,
      ownerDisplayKind: input.ownerDisplayKind,
      currentHeadKind: input.currentHeadKind,
      queueKinds: input.queueKinds,
      queueIds: input.queueIds,
      queueShellRendersResultOverlay: input.queueShellRendersResultOverlay,
      shellKind: input.shellKind,
      renderBranch: input.renderBranch,
      resultBanId: input.resultBanId,
      activeNotificationChain: input.activeNotificationChain,
      notificationOverlayVisible: input.notificationOverlayVisible,
      visualQueueDimSessionLive: input.visualQueueDimSessionLive,
      queueClaimsNotificationScreen: input.queueClaimsNotificationScreen,
    });
  } else if (
    prevArms &&
    (prevArms.claimFromQueueHead !== input.claimArms.claimFromQueueHead ||
      prevArms.claimFromActiveKind !== input.claimArms.claimFromActiveKind ||
      prevArms.claimFromEffectiveShellKind !==
        input.claimArms.claimFromEffectiveShellKind)
  ) {
    // Claim boolean unchanged, but winning arm(s) shifted — still a write for diagnosis.
    logQueueResultOverlayClaimWriteTrace({
      prevClaim,
      nextClaim: input.nextClaim,
      source: `${input.source}:claim-arms-shift`,
      reason:
        input.reason ??
        `claim-arms:${winningClaimArms(prevArms).join(',') || 'none'}->${winningClaimArms(input.claimArms).join(',') || 'none'}`,
      calledFrom: input.calledFrom,
      claimArms: input.claimArms,
      prevClaimArms: prevArms,
      queueHeadKind: input.queueHeadKind,
      activeKind: input.activeKind,
      effectiveShellKind: input.effectiveShellKind,
      ownerDisplayKind: input.ownerDisplayKind,
      currentHeadKind: input.currentHeadKind,
      queueKinds: input.queueKinds,
      queueIds: input.queueIds,
      queueShellRendersResultOverlay: input.queueShellRendersResultOverlay,
      shellKind: input.shellKind,
      renderBranch: input.renderBranch,
      resultBanId: input.resultBanId,
      activeNotificationChain: input.activeNotificationChain,
      notificationOverlayVisible: input.notificationOverlayVisible,
      visualQueueDimSessionLive: input.visualQueueDimSessionLive,
      queueClaimsNotificationScreen: input.queueClaimsNotificationScreen,
    });
  }

  prevClaimValue = input.nextClaim;
  prevClaimArms = { ...input.claimArms };
}

export function traceQueueResultOverlayClaimStuckIfNeeded(
  input: QueueResultOverlayClaimStuckTraceInput,
): void {
  if (!isClientDiagTraceEnvironment()) return;

  const enrichment = hooks?.readEnrichment() ?? {};
  const ownerQueue =
    input.ownerQueue.length > 0
      ? input.ownerQueue
      : (enrichment.ownerQueue ?? input.ownerQueue);
  const claimed =
    input.queueResultOverlayClaimed === true ||
    enrichment.queueResultOverlayClaimed === true;
  if (!claimed) return;

  const kinds = queueKinds(ownerQueue);
  if (kinds[0] !== 'result') return;
  if (kinds.length <= 1) return;

  const nextAfterResult = ownerQueue[1] ?? null;
  if (!nextAfterResult) return;

  const notificationOverlayVisible =
    input.notificationOverlayVisible ??
    enrichment.notificationOverlayVisible ??
    null;
  const activeNotificationChain =
    input.activeNotificationChain ??
    enrichment.activeNotificationChain ??
    null;
  if (notificationOverlayVisible !== true) return;
  if (activeNotificationChain !== true) return;

  const ids = queueIds(ownerQueue);
  const keys = queueKeys(ownerQueue);
  const nextAfterResultKind = nextAfterResult.kind;
  const nextAfterResultId = queueHeadIdFrom(nextAfterResult);
  const sig = [
    claimed,
    kinds.join(','),
    ids.join(','),
    nextAfterResultKind,
    nextAfterResultId,
  ].join('|');
  if (sig === lastStuckSig) return;
  lastStuckSig = sig;

  const overlayQueueRef =
    input.overlayQueueRef ?? enrichment.overlayQueueRef ?? [];
  const overlayQueueState =
    input.overlayQueueState ?? enrichment.overlayQueueState ?? ownerQueue;
  const arms = resolveClaimArms({
    queueHeadKind: kinds[0] ?? null,
    activeKind: input.activeKind ?? enrichment.activeKind ?? null,
    effectiveShellKind:
      input.effectiveShellKind ?? enrichment.effectiveShellKind ?? null,
    claimArms: input.claimArms,
  });
  const resultBanId =
    input.resultBanId ??
    enrichment.resultBanId ??
    (ownerQueue[0]?.kind === 'result'
      ? queueHeadIdFrom(ownerQueue[0])
      : null);

  const payload = {
    timestamp: diagTraceNow(),
    source: input.source,
    reason:
      input.reason ??
      'claim-true-while-result-head-has-tail',
    calledFrom: input.calledFrom ?? input.source,
    stack: captureStuckStack(),
    queueResultOverlayClaimed: true,
    queueShellRendersResultOverlay:
      input.queueShellRendersResultOverlay ??
      enrichment.queueShellRendersResultOverlay ??
      null,
    shellKind: input.shellKind ?? enrichment.shellKind ?? null,
    renderBranch: input.renderBranch ?? enrichment.renderBranch ?? null,
    activeKind: input.activeKind ?? enrichment.activeKind ?? null,
    ownerDisplayKind:
      input.ownerDisplayKind ?? enrichment.ownerDisplayKind ?? null,
    currentHeadKind:
      input.currentHeadKind ?? enrichment.currentHeadKind ?? kinds[0] ?? null,
    resultBanId,
    resultOverlayKey:
      input.resultOverlayKey ??
      enrichment.resultOverlayKey ??
      (resultBanId ? `result:${resultBanId}` : null),
    nextAfterResultKind,
    nextAfterResultId,
    queueLen: ownerQueue.length,
    queueKinds: kinds,
    queueIds: ids,
    queueKeys: keys,
    refLen: overlayQueueRef.length,
    refKinds: queueKinds(overlayQueueRef),
    refIds: queueIds(overlayQueueRef),
    refKeys: queueKeys(overlayQueueRef),
    stateLen: overlayQueueState.length,
    stateKinds: queueKinds(overlayQueueState),
    stateIds: queueIds(overlayQueueState),
    stateKeys: queueKeys(overlayQueueState),
    claimFromQueueHead: arms.claimFromQueueHead,
    claimFromActiveKind: arms.claimFromActiveKind,
    claimFromEffectiveShellKind: arms.claimFromEffectiveShellKind,
    winningClaimArms: winningClaimArms(arms),
    activeNotificationChain,
    explicitDrainReason:
      input.explicitDrainReason ?? enrichment.explicitDrainReason ?? null,
    drainSessionId: input.drainSessionId ?? enrichment.drainSessionId ?? null,
    queueClaimsNotificationScreen:
      input.queueClaimsNotificationScreen ??
      enrichment.queueClaimsNotificationScreen ??
      null,
    notificationOverlayVisible,
    visualQueueDimSessionLive:
      input.visualQueueDimSessionLive ??
      enrichment.visualQueueDimSessionLive ??
      null,
  };

  emitClientDiagTrace('QUEUE_RESULT_OVERLAY_CLAIM_STUCK_TRACE', payload);
}

export function buildClaimTraceOwnerFields(owner: {
  queue: QueuedOverlay[];
  active: { kind: string | null; banId: string | null };
  display: {
    result?: { id: string } | null;
    incomingBan?: { id: string } | null;
    checkBan?: { id: string } | null;
  };
}): {
  ownerQueue: QueuedOverlay[];
  activeKind: string | null;
  ownerDisplayKind: string | null;
  currentHeadKind: string | null;
  queueKinds: string[];
  queueIds: string[];
} {
  const head = owner.queue[0] ?? null;
  const display = resolveOwnerDisplayKindBanId(owner.display);
  return {
    ownerQueue: owner.queue,
    activeKind: owner.active.kind,
    ownerDisplayKind: display.displayKind,
    currentHeadKind: head?.kind ?? owner.active.kind,
    queueKinds: queueKinds(owner.queue),
    queueIds: queueIds(owner.queue),
  };
}
