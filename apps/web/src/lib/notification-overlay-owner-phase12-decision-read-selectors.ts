import type { BanResult } from '@98plus/shared';
import type { QueuedOverlay } from '@/lib/overlay-queue';
import { overlayBanId, overlayQueueKey } from '@/lib/overlay-queue';
import { normalizeId } from '@/lib/normalize-json';
import type {
  NotificationOverlayOwnerState,
  NotificationOwnerDisplayState,
} from '@/lib/notification-overlay-owner';
import { readOwnerOnlyResult } from '@/lib/notification-overlay-owner-read-selectors';
import { readOwnerC2AtomicBanId } from '@/lib/notification-overlay-owner-chain-read-selectors';
import { logPhase12DecisionRead } from '@/lib/notification-overlay-owner-phase12-decision-debug';

export type Phase12DecisionComponent =
  | 'effectiveNotificationQueueShellKind'
  | 'incomingNotificationShellKind'
  | 'showNextNotificationFromChainSync'
  | 'syncDisplayFromQueue'
  | 'startLobbyBansNotificationDrain';

export function overlayQueueHeadSnapshot(
  head: QueuedOverlay | null | undefined,
): string | null {
  if (!head) return null;
  const banId = normalizeId(overlayBanId(head)) || null;
  return banId ? `${head.kind}:${banId}` : head.kind;
}

/** Phase 12.2A: owner queue head — legacy queue only compare/log. */
export function readOwnerDecisionQueueHead(
  ownerQueue: readonly QueuedOverlay[],
  legacyQueue: readonly QueuedOverlay[],
  component: Phase12DecisionComponent,
  decision: string,
  reason: string,
): QueuedOverlay | null {
  const ownerHead = ownerQueue[0] ?? null;
  const legacyHead = legacyQueue[0] ?? null;
  const ownerSnap = overlayQueueHeadSnapshot(ownerHead);
  const legacySnap = overlayQueueHeadSnapshot(legacyHead);
  logPhase12DecisionRead({
    component,
    decision,
    ownerDecision: ownerSnap,
    legacyDecision: legacySnap,
    mismatch: ownerSnap !== legacySnap,
    banId: ownerHead ? normalizeId(overlayBanId(ownerHead)) || null : null,
    resultId:
      ownerHead?.kind === 'result'
        ? ownerHead.result.id
        : null,
    queueHead: ownerSnap,
    reason,
  });
  return ownerHead;
}

/** Phase 12.2A: owner pending head — legacy pending only compare/log. */
export function readOwnerDecisionPendingHead(
  ownerPending: readonly QueuedOverlay[],
  legacyPending: readonly QueuedOverlay[],
  component: Phase12DecisionComponent,
  decision: string,
  reason: string,
): QueuedOverlay | null {
  const ownerHead =
    ownerPending.find((item) => item.kind !== 'result') ??
    ownerPending[0] ??
    null;
  const legacyHead =
    legacyPending.find((item) => item.kind !== 'result') ??
    legacyPending[0] ??
    null;
  const ownerSnap = overlayQueueHeadSnapshot(ownerHead);
  const legacySnap = overlayQueueHeadSnapshot(legacyHead);
  logPhase12DecisionRead({
    component,
    decision,
    ownerDecision: ownerSnap,
    legacyDecision: legacySnap,
    mismatch: ownerSnap !== legacySnap,
    banId: ownerHead ? normalizeId(overlayBanId(ownerHead)) || null : null,
    queueHead: ownerSnap,
    reason,
  });
  return ownerHead;
}

export function readOwnerDecisionQueueLen(
  ownerQueue: readonly QueuedOverlay[],
  legacyQueue: readonly QueuedOverlay[],
  component: Phase12DecisionComponent,
  decision: string,
  reason: string,
): number {
  const ownerLen = ownerQueue.length;
  const legacyLen = legacyQueue.length;
  logPhase12DecisionRead({
    component,
    decision,
    ownerDecision: ownerLen,
    legacyDecision: legacyLen,
    mismatch: ownerLen !== legacyLen,
    reason,
  });
  return ownerLen;
}

export function readOwnerDecisionPendingLen(
  ownerPending: readonly QueuedOverlay[],
  legacyPending: readonly QueuedOverlay[],
  component: Phase12DecisionComponent,
  decision: string,
  reason: string,
): number {
  const ownerLen = ownerPending.length;
  const legacyLen = legacyPending.length;
  logPhase12DecisionRead({
    component,
    decision,
    ownerDecision: ownerLen,
    legacyDecision: legacyLen,
    mismatch: ownerLen !== legacyLen,
    reason,
  });
  return ownerLen;
}

/** Phase 12.2A: owner atomic ban id for shell decisions — ref only compare. */
export function readOwnerDecisionShellAtomicBanId(
  owner: NotificationOverlayOwnerState,
  legacyAtomicRef: string | null | undefined,
  component: Phase12DecisionComponent,
  decision: string,
): string {
  const ownerId =
    readOwnerC2AtomicBanId(owner, 'renderShellKind', {
      ref: legacyAtomicRef ?? null,
    }) ?? '';
  const legacyNorm = legacyAtomicRef ? normalizeId(legacyAtomicRef) || '' : '';
  logPhase12DecisionRead({
    component,
    decision,
    ownerDecision: ownerId || null,
    legacyDecision: legacyNorm || null,
    mismatch: (ownerId || null) !== (legacyNorm || null),
    banId: ownerId || null,
    reason: 'owner-holds-atomicOverboardBanId',
  });
  return ownerId;
}

/** Phase 12.2A: owner display result id for shell — legacy result only compare. */
export function readOwnerDecisionShellDisplayResultId(
  display: NotificationOwnerDisplayState,
  legacy: { ref?: BanResult | null; state?: BanResult | null },
  component: Phase12DecisionComponent,
  decision: string,
): string {
  const ownerResult = readOwnerOnlyResult(
    display,
    'effectiveNotificationQueueShellKind',
    legacy,
  );
  const legacyId =
    legacy.ref?.id ?? legacy.state?.id ?? null;
  const ownerNorm = normalizeId(ownerResult?.id ?? '') || '';
  const legacyNorm = legacyId ? normalizeId(legacyId) || '' : '';
  logPhase12DecisionRead({
    component,
    decision,
    ownerDecision: ownerNorm || null,
    legacyDecision: legacyNorm || null,
    mismatch: (ownerNorm || null) !== (legacyNorm || null),
    resultId: ownerNorm || null,
    reason: 'owner-display-result',
  });
  return ownerNorm;
}

/** Phase 12.2A: fresh overboard action live — owner holds authoritative. */
export function readOwnerDecisionFreshOverboardActionLive(
  owner: NotificationOverlayOwnerState,
  atomicNorm: string,
  legacyFreshIds: ReadonlySet<string>,
  component: Phase12DecisionComponent,
  decision: string,
): boolean {
  if (!atomicNorm) return false;
  const ownerLive =
    owner.holds.overkillTerminalBanIds.has(atomicNorm) ||
    normalizeId(owner.holds.atomicOverboardBanId ?? '') === atomicNorm ||
    owner.holds.resultPriorityBanIds.has(atomicNorm);
  const legacyLive = legacyFreshIds.has(atomicNorm);
  logPhase12DecisionRead({
    component,
    decision,
    ownerDecision: ownerLive,
    legacyDecision: legacyLive,
    mismatch: ownerLive !== legacyLive,
    banId: atomicNorm,
    reason: 'fresh-overboard-action-live',
  });
  return ownerLive;
}

export type ShowNextHeadDecision = {
  head: QueuedOverlay | null;
  startupHead: QueuedOverlay | null;
  overlayLen: number;
  startupLen: number;
  hasNext: boolean;
  nextKind: QueuedOverlay['kind'] | null;
  nextBanId: string | null;
};

export function resolveShowNextHeadDecision(
  owner: NotificationOverlayOwnerState,
  legacyQueue: readonly QueuedOverlay[],
  legacyPending: readonly QueuedOverlay[],
): ShowNextHeadDecision {
  const overlayLen = readOwnerDecisionQueueLen(
    owner.queue,
    legacyQueue,
    'showNextNotificationFromChainSync',
    'queue-len',
    'owner-queue-len',
  );
  const startupLen = readOwnerDecisionPendingLen(
    owner.pending,
    legacyPending,
    'showNextNotificationFromChainSync',
    'pending-len',
    'owner-pending-len',
  );
  const head = readOwnerDecisionQueueHead(
    owner.queue,
    legacyQueue,
    'showNextNotificationFromChainSync',
    'queue-head',
    'owner-queue-head',
  );
  const startupHead = readOwnerDecisionPendingHead(
    owner.pending,
    legacyPending,
    'showNextNotificationFromChainSync',
    'pending-head',
    'owner-pending-head',
  );
  const hasNext = overlayLen > 0 || startupLen > 0;
  const nextKind = head?.kind ?? startupHead?.kind ?? null;
  const nextBanId =
    head?.kind === 'result'
      ? head.result.id
      : head?.kind === 'incoming' || head?.kind === 'check'
        ? head.ban.id
        : startupHead?.kind === 'incoming' || startupHead?.kind === 'check'
          ? startupHead.ban.id
          : startupHead?.kind === 'result'
            ? startupHead.result.id
            : null;
  logPhase12DecisionRead({
    component: 'showNextNotificationFromChainSync',
    decision: 'next-head-summary',
    ownerDecision: nextKind,
    legacyDecision:
      (legacyQueue[0]?.kind ?? legacyPending[0]?.kind ?? null) as string | null,
    mismatch: false,
    banId: nextBanId,
    queueHead: overlayQueueHeadSnapshot(head ?? startupHead),
    reason: 'owner-next-head-summary',
  });
  return {
    head,
    startupHead,
    overlayLen,
    startupLen,
    hasNext,
    nextKind,
    nextBanId,
  };
}

export type LobbyBansDrainGateDecision = {
  canDrain: boolean;
  ownerPending: number;
  ownerQueue: number;
  legacyPending: number;
  legacyQueue: number;
  legacyWouldDrain: boolean;
  reason: string;
};

/** Phase 12.2A: owner-authoritative lobby bans drain gate. */
export function resolveLobbyBansDrainGateDecision(
  owner: NotificationOverlayOwnerState,
  legacy: {
    pendingLen: number;
    queueLen: number;
    incomingPresent: boolean;
    checkPresent: boolean;
    resultPresent: boolean;
    hasPendingChain: boolean;
  },
): LobbyBansDrainGateDecision {
  const ownerPending = owner.pending.length;
  const ownerQueue = owner.queue.length;
  const legacyWouldDrain =
    legacy.pendingLen > 0 ||
    legacy.queueLen > 0 ||
    legacy.incomingPresent ||
    legacy.checkPresent ||
    legacy.resultPresent ||
    legacy.hasPendingChain;
  const canDrain = ownerPending > 0 || ownerQueue > 0;
  const reason = canDrain
    ? 'owner-pending-or-queue-nonempty'
    : 'owner-queue-empty';
  logPhase12DecisionRead({
    component: 'startLobbyBansNotificationDrain',
    decision: 'drain-gate',
    ownerDecision: canDrain,
    legacyDecision: legacyWouldDrain,
    mismatch: canDrain !== legacyWouldDrain,
    reason,
    queueHead: overlayQueueHeadSnapshot(
      owner.queue[0] ?? owner.pending[0] ?? null,
    ),
  });
  return {
    canDrain,
    ownerPending,
    ownerQueue,
    legacyPending: legacy.pendingLen,
    legacyQueue: legacy.queueLen,
    legacyWouldDrain,
    reason,
  };
}

/** Phase 12.2A: syncDisplayFromQueue reads owner queue; param queue for compare only. */
export function readOwnerDecisionSyncDisplayQueue(
  ownerQueue: readonly QueuedOverlay[],
  legacyQueue: readonly QueuedOverlay[],
): readonly QueuedOverlay[] {
  readOwnerDecisionQueueHead(
    ownerQueue,
    legacyQueue,
    'syncDisplayFromQueue',
    'sync-display-queue-head',
    'owner-queue-authoritative',
  );
  readOwnerDecisionQueueLen(
    ownerQueue,
    legacyQueue,
    'syncDisplayFromQueue',
    'sync-display-queue-len',
    'owner-queue-authoritative',
  );
  return ownerQueue;
}

export function mapOverlayQueueItemIds(
  queue: readonly QueuedOverlay[],
): string[] {
  return queue.map((item) => overlayQueueKey(item));
}
