'use client';

import { isPostSuccessHandoffInProgress } from '@/lib/post-success-handoff-debug';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export type ExplicitDrainPendingSnapshot = {
  source: string;
  phase: string;
  queueLen: number;
  pendingLen: number;
  incomingLen?: number;
  checkLen?: number;
  resultLen?: number;
  bufferedIncomingId?: string | null;
  heldNextKind?: string | null;
  hasPendingNotificationChain: boolean;
  isChainSnapshotEmpty?: boolean;
  handoffInProgress?: boolean;
};

export function logExplicitDrainPendingSnapshot(
  data: ExplicitDrainPendingSnapshot,
): void {
  emit('[EXPLICIT DRAIN PENDING SNAPSHOT]', {
    handoffInProgress: isPostSuccessHandoffInProgress(),
    ...data,
  });
}

export function logExplicitDrainStart(data: {
  path: 'success-exit' | 'timer-exit';
  source: string;
  queueLen: number;
  pendingLen: number;
  hasPendingNotificationChain: boolean;
}): void {
  emit('[EXPLICIT DRAIN START]', data);
}

export function logExplicitDrainFinalDecision(data: {
  path: 'success-exit' | 'timer-exit';
  decision: 'mount-overlay' | 'stay-on-lobby-empty' | 'preserve-pending' | 'retry-drain';
  drained?: boolean;
  outcome?: string | null;
  queueLen: number;
  pendingLen: number;
  hasPendingNotificationChain: boolean;
  selectedKind?: string | null;
  selectedBanId?: string | null;
  reason?: string;
}): void {
  emit('[EXPLICIT DRAIN FINAL DECISION]', data);
}

export function logExplicitDrainCtaWhenNoOverlay(data: {
  path: 'success-exit' | 'timer-exit';
  ctaAction: 'hidden-preserved' | 'restoring' | 'unchanged';
  ctaState?: string;
  postSuccessHandoffBlocking?: boolean;
  notificationChainTransitioning?: boolean;
  reason: string;
}): void {
  emit('[EXPLICIT DRAIN CTA NO OVERLAY]', data);
}
