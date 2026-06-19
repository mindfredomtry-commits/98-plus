'use client';

export type ConfirmOrbDebugSnapshot = {
  lobbyOrbVisible: boolean;
  primaryBlocker: string | null;
  showLobbyOrb: boolean;
  showBootOrb: boolean;
  postSuccessHandoffBlocking: boolean;
  postSuccessHandoffActive: boolean;
  notificationChainTransitioning: boolean;
  overlayHandoffLobbySuppressed: boolean;
  successExitDraining: boolean;
  confirmActive: boolean;
  phase: string;
  sendComposePhase: string | null;
};

let latestConfirmOrbSnapshot: ConfirmOrbDebugSnapshot | null = null;

export function patchConfirmOrbDebugSnapshot(
  snapshot: ConfirmOrbDebugSnapshot | null,
): void {
  latestConfirmOrbSnapshot = snapshot;
}

export function readConfirmOrbDebugSnapshot(): ConfirmOrbDebugSnapshot | null {
  return latestConfirmOrbSnapshot;
}
