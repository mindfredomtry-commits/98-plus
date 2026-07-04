'use client';

export type QueueBreakSnapshotPhase =
  | 'before-action'
  | 'after-consume'
  | 'after-continue'
  | 'after-1s'
  | 'after-poll';

export type QueueBreakSnapshotPayload = {
  phase: QueueBreakSnapshotPhase;
  'overlayQueue.length': number;
  'pending.length': number;
  activeKind: string | null;
  displayKind: string | null;
  headKind: string | null;
  visibleOverlayKind: string | null;
  awaitingUser: boolean;
  chainAdvanceExplicit: boolean;
  notificationChainTransitioning: boolean;
  explicitDrainSource: string | null;
  lastOutcome: string | null;
  source: string;
  reason: string;
  banId: string | null;
  activeBanId: string | null;
  headBanId: string | null;
  pendingHeadBanId: string | null;
  remainingBanIds: string[];
  queueHeadKey: string | null;
  pendingHeadKey: string | null;
  hasResult: boolean;
  hasCheck: boolean;
  hasIncoming: boolean;
  generation?: number;
};

export function logQueueBreakSnapshot(payload: QueueBreakSnapshotPayload): void {
  const entry = { t: performance.now(), ...payload };
  console.log('QUEUE_BREAK_SNAPSHOT', entry);
  if (typeof window !== 'undefined') {
    window.__debug98log?.('QUEUE_BREAK_SNAPSHOT', entry);
  }
}
