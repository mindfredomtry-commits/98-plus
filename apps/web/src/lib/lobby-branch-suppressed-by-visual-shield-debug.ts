'use client';

export type LobbyBranchSuppressedByVisualShieldTrace = {
  visualQueueDimSessionLive: boolean;
  sendFlowOpening: boolean;
  renderBranchBefore: string;
  renderBranchAfter: string;
  reason: string;
  activeKind: string | null;
  shellKind: string | null;
  queueHeadKind: string | null;
};

export function logLobbyBranchSuppressedByVisualShield(
  trace: LobbyBranchSuppressedByVisualShieldTrace,
): void {
  const payload = { timestamp: performance.now(), ...trace };
  console.log('LOBBY_BRANCH_SUPPRESSED_BY_VISUAL_SHIELD', payload);
  window.__debug98log?.('LOBBY_BRANCH_SUPPRESSED_BY_VISUAL_SHIELD', payload);
}
