type BootHandoffDebugSnapshot = {
  bootSceneVisible: boolean;
  introEnded: boolean;
  introPrimed: boolean;
  showLobbyChrome: boolean;
  showLobbyCta: boolean;
  showBottomNav: boolean;
  showBootScene: boolean;
  hasPlayedIntro: boolean;
  onIntroEndCalls: number;
  markPrimedCalls: number;
  orbSource: 'BootScene' | 'Lobby' | 'none';
  introRunCount: number;
  orbInstanceId: string;
  launchStage: string;
};

let snapshot: BootHandoffDebugSnapshot = {
  bootSceneVisible: false,
  introEnded: false,
  introPrimed: false,
  showLobbyChrome: false,
  showLobbyCta: false,
  showBottomNav: false,
  showBootScene: false,
  hasPlayedIntro: false,
  onIntroEndCalls: 0,
  markPrimedCalls: 0,
  orbSource: 'none',
  introRunCount: 0,
  orbInstanceId: '',
  launchStage: 'done',
};

const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((l) => l());
}

export function getBootHandoffDebug(): BootHandoffDebugSnapshot {
  return snapshot;
}

export function subscribeBootHandoffDebug(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function patchBootHandoffDebug(
  patch: Partial<BootHandoffDebugSnapshot>,
): void {
  snapshot = { ...snapshot, ...patch };
  notify();
}

export function recordBootIntroRun(): void {
  patchBootHandoffDebug({
    introRunCount: snapshot.introRunCount + 1,
  });
}

export function recordBootIntroEndCall(): void {
  patchBootHandoffDebug({
    onIntroEndCalls: snapshot.onIntroEndCalls + 1,
    introEnded: true,
  });
}

export function recordBootMarkPrimedCall(): void {
  patchBootHandoffDebug({
    markPrimedCalls: snapshot.markPrimedCalls + 1,
    introPrimed: true,
    hasPlayedIntro: true,
    introEnded: true,
    bootSceneVisible: false,
    showBootScene: false,
  });
}
