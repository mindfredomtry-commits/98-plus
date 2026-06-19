'use client';

export type LobbyCtaDebugSnapshot = {
  showLobbyChrome: boolean;
  showTopNav: boolean;
  ctaVisible: boolean;
  ctaShellVisible: boolean;
  ctaState: string;
  instantBanOpen: boolean;
  phase: string;
};

let latestLobbyCtaSnapshot: LobbyCtaDebugSnapshot | null = null;

export function patchLobbyCtaDebugSnapshot(
  snapshot: LobbyCtaDebugSnapshot | null,
): void {
  latestLobbyCtaSnapshot = snapshot;
}

export function readLobbyCtaDebugSnapshot(): LobbyCtaDebugSnapshot | null {
  return latestLobbyCtaSnapshot;
}
