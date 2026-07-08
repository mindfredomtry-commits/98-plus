'use client';

import { recordRenderBranchSnapshot } from '@/lib/render-branch-snapshot-debug';

export type ResultRenderSelectionTrace = {
  activeOverlayKind?: string | null;
  activeKind?: string | null;
  effectiveKind?: string | null;
  shellKind?: string | null;
  activeBanId?: string | null;
  activeResultId?: string | null;
  resultBanId?: string | null;
  resultId?: string | null;
  hasResult?: boolean;
  hasResultOverlay?: boolean;
  hasNotificationOverlay?: boolean;
  hasAnyOverlay?: boolean;
  displayResultExists?: boolean;
  willRenderResultOverlay?: boolean;
  willRenderNotificationOverlay?: boolean;
  willRenderLobby?: boolean;
  overlayQueueLength?: number;
  pendingLen?: number;
  queueHeadKind?: string | null;
  queueHeadBanId?: string | null;
  queueHeadResultId?: string | null;
  queueClaimsNotificationScreen?: boolean;
  queueLobbyGuardActive?: boolean;
  showLobby?: boolean;
  showLobbyCta?: boolean;
  renderBranch: string;
  reason?: string | null;
};

export type ResultRenderBranchTrace = {
  renderBranch: string;
  reason?: string | null;
  component?: string;
  [key: string]: unknown;
};

export function logResultRenderSelectionTrace(
  payload: ResultRenderSelectionTrace,
): void {
  const entry = { t: performance.now(), ...payload };
  console.log('RESULT_RENDER_SELECTION_TRACE', entry);
  if (typeof window !== 'undefined') {
    window.__debug98log?.('RESULT_RENDER_SELECTION_TRACE', entry);
  }
}

export function logResultRenderBranch(payload: ResultRenderBranchTrace): void {
  const entry = { t: performance.now(), ...payload };
  console.log('RESULT_RENDER_BRANCH', entry);
  if (typeof window !== 'undefined') {
    window.__debug98log?.('RESULT_RENDER_BRANCH', entry);
  }
  recordRenderBranchSnapshot({
    renderBranch: payload.renderBranch,
    reason:
      typeof payload.reason === 'string' ? payload.reason : null,
    component:
      typeof payload.component === 'string' ? payload.component : null,
  });
}

export function resolveOverlayRenderBranchFromKind(
  kind: 'incoming' | 'check' | 'result' | null | undefined,
): string {
  if (kind === 'result') return 'result-overlay';
  if (kind === 'incoming') return 'incoming-overlay';
  if (kind === 'check') return 'check-overlay';
  return 'base-null';
}
